import { existsSync, readFileSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { fileURLToPath } from "node:url";
import { zipSync } from "fflate";
import { generateSynthesis, type AiProvider } from "./ai.ts";
import { buildDirectorDashboard, type DirectorDashboard } from "./dashboard.ts";
import { respondentGroups, type AssessmentRecord, type RespondentGroup } from "./domain.ts";
import { renderFeedbackPdf } from "./pdf.ts";
import { buildFeedbackReport, type ReportSynthesis } from "./report.ts";
import type { StoredSynthesis, SynthesisRepository } from "./store.ts";
import { checkPublication } from "./validation.ts";

const MAX_BODY_BYTES = 64 * 1024;

const groupLabels: Record<RespondentGroup, string> = {
  professores: "Professores",
  funcionarios: "Funcionários",
  pais_responsaveis: "Pais / Responsáveis",
};

const securityHeaders: Record<string, string> = {
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "referrer-policy": "no-referrer",
  "content-security-policy":
    "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'self'",
};

class HttpError extends Error {
  public readonly statusCode: number;

  public constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
  }
}

export interface AppOptions {
  records: readonly AssessmentRecord[];
  synthesisStore?: SynthesisRepository;
  sourceFile: string;
  aiProvider?: AiProvider;
  logoBuffer?: Buffer | null;
  readOnly?: boolean;
  basePath?: "/admin";
}

function loadDefaultLogo(): Buffer | null {
  const candidates = [
    fileURLToPath(new URL("../assets/logotipo.png", import.meta.url)),
    fileURLToPath(new URL("../../assets/logotipo.png", import.meta.url)),
  ];
  for (const path of candidates) {
    if (existsSync(path)) return readFileSync(path);
  }
  return null;
}

function escapeHtml(value: unknown): string {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatMeanBr(value: number | null): string {
  return value === null ? "indisponível" : value.toFixed(2).replace(".", ",");
}

function formatDateTimeBr(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function sanitizeAsciiFilename(name: string): string {
  const ascii = name
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return ascii || "diretor";
}

function buildContentDisposition(prefix: string, name: string, extension: string): string {
  const asciiName = `${prefix}-${sanitizeAsciiFilename(name)}.${extension}`;
  const cleanUtf8 = name.replace(/[\r\n"\\/]+/g, " ").trim() || "diretor";
  const utf8Encoded = encodeURIComponent(`${prefix}-${cleanUtf8}.${extension}`);
  return `attachment; filename="${asciiName}"; filename*=UTF-8''${utf8Encoded}`;
}

function isRespondentGroup(value: unknown): value is RespondentGroup {
  return typeof value === "string" && (respondentGroups as readonly string[]).includes(value);
}

function writeJson(
  response: ServerResponse,
  statusCode: number,
  payload: unknown,
  extraHeaders: Record<string, string> = {},
): void {
  response.writeHead(statusCode, {
    ...securityHeaders,
    "content-type": "application/json; charset=utf-8",
    ...extraHeaders,
  });
  response.end(JSON.stringify(payload));
}

function writeText(
  response: ServerResponse,
  statusCode: number,
  body: string,
  extraHeaders: Record<string, string> = {},
): void {
  response.writeHead(statusCode, {
    ...securityHeaders,
    "content-type": "text/plain; charset=utf-8",
    ...extraHeaders,
  });
  response.end(body);
}

function assertSameOriginPost(request: IncomingMessage): void {
  const contentType = String(request.headers["content-type"] ?? "").toLowerCase();
  if (!contentType.startsWith("application/json")) {
    throw new HttpError(415, "Content-Type deve ser application/json.");
  }
  const secFetchSite = String(request.headers["sec-fetch-site"] ?? "").toLowerCase();
  if (secFetchSite === "cross-site") {
    throw new HttpError(403, "Requisição de origem externa não permitida.");
  }
  const origin = request.headers.origin;
  const host = request.headers.host;
  if (origin && host) {
    let originHost: string;
    try {
      originHost = new URL(origin).host;
    } catch {
      throw new HttpError(403, "Cabeçalho Origin inválido.");
    }
    if (originHost !== host) {
      throw new HttpError(403, "Requisição de origem externa não permitida.");
    }
  }
}

async function readJsonBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let totalBytes = 0;
  for await (const chunk of request) {
    const buffer = Buffer.from(chunk);
    totalBytes += buffer.length;
    if (totalBytes > MAX_BODY_BYTES) {
      throw new HttpError(413, "Corpo da requisição excede o limite permitido (64 KB).");
    }
    chunks.push(buffer);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new HttpError(400, "JSON inválido no corpo da requisição.");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new HttpError(400, "O corpo da requisição deve ser um objeto JSON.");
  }
  return parsed as Record<string, unknown>;
}

function renderMetaLine(latest: StoredSynthesis | undefined, totalVersions: number): string {
  if (!latest) return "Nenhuma versão registrada ainda.";
  const origin = latest.generatedBy === "ia" ? "gerada por IA" : `por ${latest.author}`;
  const note = latest.reviewNote ? ` · Obs.: ${latest.reviewNote}` : "";
  return `${totalVersions} ${totalVersions === 1 ? "versão" : "versões"} · última ${origin} em ${formatDateTimeBr(latest.createdAt)}${note}`;
}

export function createApp(options: AppOptions): Server {
  return createServer(createRequestHandler(options));
}

export function createRequestHandler(options: AppOptions) {
  const { records, synthesisStore, sourceFile, aiProvider, basePath = "" } = options;
  const readOnly = options.readOnly ?? !synthesisStore;
  async function readSyntheses(): Promise<StoredSynthesis[]> {
    return !readOnly && synthesisStore ? await synthesisStore.listAll() : [];
  }
  const brandLogoBuffer =
    options.logoBuffer === undefined ? loadDefaultLogo() : options.logoBuffer;

  const directors = [...new Set(records.map((record) => record.director))].sort((a, b) =>
    a.localeCompare(b, "pt-BR"),
  );
  if (directors.length === 0) {
    throw new Error("Nenhum diretor reconhecido para montar o dashboard.");
  }
  const directorSet = new Set(directors);

  // Pre-compute immutable per-director dashboards once at startup
  const dashboardsByDirector = new Map<string, DirectorDashboard>();
  for (const director of directors) {
    dashboardsByDirector.set(director, buildDirectorDashboard(records, director));
  }

  const inferredCycleFromFile = sourceFile.match(/\b(20\d{2})\b/)?.[1] ?? null;
  const generatingDirectors = new Set<string>();

  function versionsFor(entries: readonly StoredSynthesis[], director: string, group: string): StoredSynthesis[] {
    return entries.filter((entry) => entry.director === director && entry.group === group);
  }

  function countApprovedGroups(director: string, entries: readonly StoredSynthesis[]): number {
    return respondentGroups.filter((group) => {
      const latest = versionsFor(entries, director, group).at(-1);
      return latest?.status === "aprovada";
    }).length;
  }

  function buildReportForDirector(director: string, entries: readonly StoredSynthesis[]) {
    const dashboard = dashboardsByDirector.get(director)!;
    const inferredCycle = dashboard.cycle ?? inferredCycleFromFile;
    let maxVersion = 1;
    let approvedCount = 0;

    const syntheses = Object.fromEntries(
      respondentGroups.map((group) => {
        const versions = versionsFor(entries, director, group);
        const latest = versions.at(-1);
        if (latest && latest.version > maxVersion) maxVersion = latest.version;
        const preferred =
          [...versions].reverse().find((entry) => entry.status === "aprovada") ?? latest;
        if (latest?.status === "aprovada") approvedCount += 1;
        return [group, preferred?.content ?? null];
      }),
    );

    const allApproved = approvedCount === respondentGroups.length;
    const publication = checkPublication(
      {
        sourceFile,
        responseSheet: "Dados unificados",
        responseCount: records.length,
        directorCount: directors.length,
        groups: {},
        questionMap: [],
        sheets: [],
        issues: [],
        status: "em_revisao",
      },
      {
        meanRuleApproved: allApproved,
        confidentialityThresholdApproved: allApproved,
        questionClassificationApproved: false,
      },
    );

    return buildFeedbackReport(
      { ...dashboard, cycle: inferredCycle },
      publication,
      syntheses,
      undefined,
      maxVersion,
    );
  }

  function renderPage(selectedDirector: string, entries: readonly StoredSynthesis[]): string {
    const dashboard = dashboardsByDirector.get(selectedDirector)!;
    const cards = Object.values(dashboard.groups)
      .map(
        (group) => `
        <article class="card kpi kpi-${escapeHtml(group.group)}">
          <div class="card-accent"></div>
          <h2>${escapeHtml(groupLabels[group.group] ?? group.group)}</h2>
          <p class="metric-value">${escapeHtml(formatMeanBr(group.overall.mean))}</p>
          <p class="metric-sub">${group.submissions === 1 ? "1 participante" : `${group.submissions} participantes`}</p>
          <small>${escapeHtml(
            group.overall.note ??
              `${group.overall.validCount} respostas válidas na escala ${group.overall.scale.min}–${group.overall.scale.max}.`,
          )}</small>
        </article>`,
      )
      .join("");

    const synthesisForms = respondentGroups
      .map((group) => {
        const versions = versionsFor(entries, selectedDirector, group);
        const latest = versions.at(-1);
        const latestContent = latest?.content;
        const statusClass = latest?.status === "aprovada" ? "badge-approved" : "badge-draft";
        return `
        <article class="card synthesis syn-${escapeHtml(group)}" data-group="${escapeHtml(group)}">
          <div class="syn-header">
            <h3>${escapeHtml(groupLabels[group])}</h3>
            <span class="badge ${latest ? statusClass : "badge-empty"}" data-role="badge">${
              latest ? `v${latest.version} · ${escapeHtml(latest.status)}` : "sem síntese"
            }</span>
          </div>
          <p class="syn-meta" data-role="meta">${escapeHtml(renderMetaLine(latest, versions.length))}</p>
          <form class="synthesis-form" data-group="${escapeHtml(group)}">
            <label>Responsável
              <input name="author" maxlength="200" placeholder="Nome do responsável" value="${escapeHtml(latest?.author ?? "")}" required>
            </label>
            <label>Impressão geral
              <textarea name="perception" maxlength="2000" placeholder="Como este público percebe a gestão no dia a dia" required>${escapeHtml(latestContent?.perception ?? "")}</textarea>
            </label>
            <label>Ponto forte
              <textarea name="strength" maxlength="2000" placeholder="O que mais se destacou positivamente" required>${escapeHtml(latestContent?.strength ?? "")}</textarea>
            </label>
            <label>Aspecto de atenção
              <textarea name="attention" maxlength="2000" placeholder="Pontos que merecem mais diálogo ou cuidado" required>${escapeHtml(latestContent?.attention ?? "")}</textarea>
            </label>
            <button type="submit" class="btn-outline">Salvar ajustes</button>
          </form>
          <div data-role="approve-slot">
          ${
            latest && latest.status === "rascunho"
              ? `<form class="approve-form" data-group="${escapeHtml(group)}" data-version="${latest.version}">
                  <input name="note" maxlength="1000" placeholder="Observação da aprovação (opcional)">
                  <button type="submit" class="btn-approve">Aprovar síntese</button>
                </form>`
              : ""
          }
          </div>
        </article>`;
      })
      .join("");

    const directorOptions = directors
      .map((director) => {
        const approved = countApprovedGroups(director, entries);
        const prefix = approved === respondentGroups.length ? "✓ " : "";
        return `<option value="${escapeHtml(director)}" data-name="${escapeHtml(director)}" ${
          director === selectedDirector ? "selected" : ""
        }>${escapeHtml(readOnly ? director : `${prefix}${director} (${approved}/${respondentGroups.length})`)}</option>`;
      })
      .join("");

    return `<!doctype html>
    <html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Avaliação da Gestão Escolar — Fraiburgo</title>
    <style>
      :root{
        --inverno:#4E2412;
        --verao:#A72B2A;
        --outono:#DF7835;
        --maca:#F0EDC5;
        --primavera:#587E3C;
        --bg:#FAF8F0;
        --surface:#FFFFFF;
        --text:#2E1A11;
        --muted:#6B5244;
        --border:#E5DEC9;
      }
      *{box-sizing:border-box}
      body{margin:0;font:15px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:var(--bg);color:var(--text)}
      .topbar{background:#FFFFFF;color:var(--inverno);box-shadow:0 2px 10px rgba(78,36,18,.08);position:relative}
      .topbar::after{content:"";display:block;height:5px;background:linear-gradient(90deg,var(--inverno) 0%,var(--verao) 34%,var(--outono) 67%,var(--primavera) 100%)}
      .topbar-inner{max-width:1120px;margin:0 auto;padding:.9rem 1.25rem;display:flex;align-items:center;justify-content:space-between;gap:1.25rem;flex-wrap:wrap}
      .brand{display:flex;align-items:center;gap:1rem}
      .logo-badge{display:flex;align-items:center;justify-content:center;flex-shrink:0}
      .logo-badge img{height:60px;width:auto;display:block}
      .brand-title h1{margin:0;font-size:1.5rem;letter-spacing:-.01em;color:var(--inverno)}
      .brand-title p{margin:.15rem 0 0;font-size:.92rem;font-weight:600;color:var(--verao)}
      .motto{font-style:italic;font-weight:700;color:var(--inverno);font-size:.95rem;text-align:right}
      main{max-width:1120px;margin:1.5rem auto 3rem;padding:0 1.25rem}
      .toolbar{background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:1rem 1.25rem;display:flex;flex-wrap:wrap;gap:1rem;align-items:center;justify-content:space-between;box-shadow:0 2px 8px rgba(78,36,18,.05)}
      .toolbar form{display:flex;align-items:center;gap:.65rem;flex-wrap:wrap}
      .toolbar label{font-weight:700;color:var(--inverno)}
      .toolbar-actions{display:flex;flex-wrap:wrap;gap:.6rem;align-items:center}
      select{font:inherit;padding:.5rem .75rem;border-radius:8px;border:1.5px solid #D3C6AC;background:#fff;color:var(--text);min-width:290px}
      select:focus,input:focus,textarea:focus{outline:2px solid var(--outono);border-color:var(--outono)}
      .notice{margin:1rem 0 1.25rem;background:var(--maca);border-left:5px solid var(--outono);color:var(--inverno);padding:.85rem 1.1rem;border-radius:8px;font-size:.93rem}
      .feedback{display:none;margin:0 0 1rem;padding:.75rem 1rem;border-radius:8px;font-size:.92rem;font-weight:600}
      .feedback.show{display:block}
      .feedback.ok{background:#E4EFE0;color:#2E4B1E;border-left:5px solid var(--primavera)}
      .feedback.err{background:#FBE7E7;color:#7C1E1D;border-left:5px solid var(--verao)}
      .section-bar{margin:2rem 0 1rem;display:flex;flex-wrap:wrap;gap:1rem;align-items:center;justify-content:space-between}
      .section-bar h2{margin:0;color:var(--inverno);font-size:1.25rem}
      .cards{display:grid;grid-template-columns:repeat(3,1fr);gap:1rem}
      .card{background:var(--surface);border:1.5px solid var(--border);border-radius:12px;padding:1.1rem;box-shadow:0 2px 8px rgba(78,36,18,.04);position:relative;overflow:hidden}
      .kpi{text-align:center;padding-top:1.35rem}
      .card-accent{position:absolute;top:0;left:0;right:0;height:6px}
      .kpi-professores{background:#FBF1F1;border-color:#D99998}
      .kpi-professores .card-accent{background:var(--verao)}
      .kpi-professores h2,.kpi-professores .metric-value{color:#7C1E1D}
      .kpi-funcionarios{background:#F2F6EE;border-color:#A4BD91}
      .kpi-funcionarios .card-accent{background:var(--primavera)}
      .kpi-funcionarios h2,.kpi-funcionarios .metric-value{color:#3B5727}
      .kpi-pais_responsaveis{background:#FDF4EC;border-color:#EAB68E}
      .kpi-pais_responsaveis .card-accent{background:var(--outono)}
      .kpi-pais_responsaveis h2,.kpi-pais_responsaveis .metric-value{color:#9C4A17}
      .kpi h2{margin:0;font-size:1.05rem}
      .metric-value{margin:.35rem 0 .2rem;font-size:2.35rem;font-weight:800;line-height:1.1}
      .metric-sub{margin:0 0 .35rem;font-weight:600;color:var(--text)}
      .kpi small{color:var(--muted);font-size:.82rem}
      .synthesis{display:flex;flex-direction:column;gap:.55rem;border-top-width:5px}
      .syn-professores{border-top-color:var(--verao)}
      .syn-funcionarios{border-top-color:var(--primavera)}
      .syn-pais_responsaveis{border-top-color:var(--outono)}
      .syn-header{display:flex;align-items:center;justify-content:space-between;gap:.5rem}
      .syn-header h3{margin:0;font-size:1.05rem;color:var(--inverno)}
      .syn-meta{margin:0;font-size:.78rem;color:var(--muted);min-height:1.2rem}
      .badge{font-size:.76rem;font-weight:700;padding:.2rem .55rem;border-radius:999px;white-space:nowrap}
      .badge-approved{background:#E4EFE0;color:#3B5727}
      .badge-draft{background:#FCE9D9;color:#9C4A17}
      .badge-empty{background:#EFECE2;color:var(--muted)}
      .synthesis label{display:block;font-size:.82rem;font-weight:700;color:var(--inverno);margin:.45rem 0 .2rem}
      input,textarea{display:block;width:100%;margin:.25rem 0 .5rem;padding:.55rem .65rem;font:inherit;font-size:.9rem;border:1px solid #D3C6AC;border-radius:8px;background:#FFFEFA;color:var(--text)}
      textarea{min-height:4.6rem;resize:vertical}
      button,.btn{display:inline-flex;align-items:center;justify-content:center;gap:.4rem;font:inherit;font-size:.9rem;font-weight:700;padding:.58rem 1rem;cursor:pointer;text-decoration:none;border-radius:8px;border:1.5px solid transparent;transition:filter .15s ease}
      button:hover,.btn:hover{filter:brightness(1.06)}
      button:disabled{opacity:.65;cursor:wait}
      .btn-pdf{background:var(--verao);color:#fff}
      .btn-zip{background:#fff;color:var(--inverno);border-color:var(--inverno)}
      .btn-ai{background:var(--inverno);color:#fff}
      .btn-outline{background:#fff;color:var(--inverno);border-color:var(--inverno);width:100%}
      .btn-approve{background:var(--primavera);color:#fff;width:100%}
      .approve-form{border-top:1px dashed var(--border);padding-top:.65rem;margin-top:.2rem}
      @media(max-width:860px){.cards{grid-template-columns:1fr}.motto{text-align:left}select{min-width:100%}}
    </style>
    </head><body>
    <header class="topbar">
      <div class="topbar-inner">
        <div class="brand">
          ${brandLogoBuffer ? '<div class="logo-badge"><img src="/assets/logotipo.png" alt="Fraiburgo — Terra da Maçã"></div>' : ""}
          <div class="brand-title">
            <h1>Avaliação da Gestão Escolar</h1>
            <p>Secretaria Municipal de Educação · Fraiburgo — Terra da Maçã</p>
          </div>
        </div>
        <div class="motto">Juntos por uma educação<br>cada vez melhor!</div>
      </div>
    </header>
    <main id="app" data-director="${escapeHtml(selectedDirector)}">
      <div class="toolbar">
        <form id="director-form" method="get" action="${basePath}/">
          <label for="director">Diretor(a): </label>
          <select id="director" name="director">${directorOptions}</select>
        </form>
        <div class="toolbar-actions">
          <a class="btn btn-pdf" href="${basePath}/report.pdf?director=${encodeURIComponent(selectedDirector)}">Baixar devolutiva (PDF)</a>
          <a class="btn btn-zip" href="${basePath}/reports.zip">Baixar todos (ZIP)</a>
        </div>
      </div>
      <p class="notice">${readOnly ? "Consulta pública dos resultados da avaliação." : "Ajuste e aprove as sínteses diretamente nesta tela — salvar um cartão não apaga o que você estiver editando nos outros. Os PDFs seguem a identidade visual oficial de Fraiburgo para encaminhamento externo."}</p>
      <section class="cards">${cards}</section>
      ${readOnly ? "" : `<div id="feedback" class="feedback" role="status" aria-live="polite"></div>
      <div class="section-bar">
        <h2>Sínteses por público</h2>
        <button type="button" id="btn-generate-all" class="btn-ai">Gerar síntese por IA</button>
      </div>
      <section class="cards">${synthesisForms}</section>`}
    </main>
    ${readOnly ? `<script>document.getElementById('director').addEventListener('change', () => document.getElementById('director-form').submit());</script>` : `<script>
      (() => {
        const app = document.getElementById('app');
        const director = app.dataset.director;
        const directorSelect = document.getElementById('director');
        const feedback = document.getElementById('feedback');
        const generateBtn = document.getElementById('btn-generate-all');
        const dirtyGroups = new Set();

        function showFeedback(message, isError = false) {
          feedback.textContent = message;
          feedback.className = 'feedback show ' + (isError ? 'err' : 'ok');
        }

        function formatDateTime(iso) {
          const d = new Date(iso);
          if (Number.isNaN(d.getTime())) return iso;
          return d.toLocaleString('pt-BR', {
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
          });
        }

        function refreshDirectorOptionProgress() {
          const badges = document.querySelectorAll('.synthesis [data-role="badge"]');
          let approved = 0;
          badges.forEach((b) => { if (b.classList.contains('badge-approved')) approved += 1; });
          const opt = directorSelect.selectedOptions[0];
          if (opt) {
            const name = opt.dataset.name || director;
            opt.textContent = (approved === 3 ? '✓ ' : '') + name + ' (' + approved + '/3)';
          }
        }

        function updateCard(group, entry) {
          const card = document.querySelector('article.synthesis[data-group="' + group + '"]');
          if (!card) return;
          const badge = card.querySelector('[data-role="badge"]');
          badge.textContent = 'v' + entry.version + ' · ' + entry.status;
          badge.className = 'badge ' + (entry.status === 'aprovada' ? 'badge-approved' : 'badge-draft');

          const meta = card.querySelector('[data-role="meta"]');
          const origin = entry.generatedBy === 'ia' ? 'gerada por IA' : ('por ' + entry.author);
          const note = entry.reviewNote ? (' · Obs.: ' + entry.reviewNote) : '';
          meta.textContent = entry.version + (entry.version === 1 ? ' versão' : ' versões') +
            ' · última ' + origin + ' em ' + formatDateTime(entry.createdAt) + note;

          const form = card.querySelector('.synthesis-form');
          form.elements.author.value = entry.author;
          form.elements.perception.value = entry.content.perception;
          form.elements.strength.value = entry.content.strength;
          form.elements.attention.value = entry.content.attention;
          dirtyGroups.delete(group);

          const slot = card.querySelector('[data-role="approve-slot"]');
          slot.textContent = '';
          if (entry.status === 'rascunho') {
            const approveForm = document.createElement('form');
            approveForm.className = 'approve-form';
            approveForm.dataset.group = group;
            approveForm.dataset.version = String(entry.version);
            const noteInput = document.createElement('input');
            noteInput.name = 'note';
            noteInput.maxLength = 1000;
            noteInput.placeholder = 'Observação da aprovação (opcional)';
            const approveBtn = document.createElement('button');
            approveBtn.type = 'submit';
            approveBtn.className = 'btn-approve';
            approveBtn.textContent = 'Aprovar síntese';
            approveForm.append(noteInput, approveBtn);
            slot.append(approveForm);
          }
          refreshDirectorOptionProgress();
        }

        directorSelect.addEventListener('change', () => {
          if (dirtyGroups.size > 0 && !confirm('Há alterações não salvas. Deseja trocar de diretor(a) mesmo assim?')) {
            directorSelect.value = director;
            return;
          }
          document.getElementById('director-form').submit();
        });

        document.querySelectorAll('.synthesis-form').forEach((form) => {
          const group = form.dataset.group;
          form.addEventListener('input', () => dirtyGroups.add(group));
          form.addEventListener('submit', async (event) => {
            event.preventDefault();
            const submitBtn = form.querySelector('button[type="submit"]');
            submitBtn.disabled = true;
            const data = Object.fromEntries(new FormData(form));
            try {
              const response = await fetch('${basePath}/api/syntheses', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                  director,
                  group,
                  author: data.author,
                  content: {
                    perception: data.perception,
                    strength: data.strength,
                    attention: data.attention,
                  },
                }),
              });
              const payload = await response.json();
              if (!response.ok) {
                showFeedback(payload.error || 'Não foi possível salvar os ajustes.', true);
                return;
              }
              updateCard(group, payload);
              showFeedback('Ajustes salvos (versão v' + payload.version + ').');
            } catch {
              showFeedback('Falha de comunicação ao salvar os ajustes.', true);
            } finally {
              submitBtn.disabled = false;
            }
          });
        });

        app.addEventListener('submit', async (event) => {
          const form = event.target;
          if (!(form instanceof HTMLFormElement) || !form.classList.contains('approve-form')) return;
          event.preventDefault();
          const group = form.dataset.group;
          const version = Number(form.dataset.version);
          const submitBtn = form.querySelector('button[type="submit"]');
          submitBtn.disabled = true;
          const data = Object.fromEntries(new FormData(form));
          try {
            const response = await fetch('${basePath}/api/syntheses/approve', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ director, group, version, note: data.note || '' }),
            });
            const payload = await response.json();
            if (!response.ok) {
              showFeedback(payload.error || 'Não foi possível aprovar a síntese.', true);
              return;
            }
            updateCard(group, payload);
            showFeedback('Síntese v' + payload.version + ' aprovada com sucesso.');
          } catch {
            showFeedback('Falha de comunicação ao aprovar a síntese.', true);
          } finally {
            submitBtn.disabled = false;
          }
        });

        generateBtn.addEventListener('click', async () => {
          if (dirtyGroups.size > 0 && !confirm('Existem textos editados ainda não salvos. Deseja substituí-los pelas novas sínteses da IA?')) {
            return;
          }
          generateBtn.disabled = true;
          generateBtn.textContent = 'Gerando sínteses...';
          try {
            const response = await fetch('${basePath}/api/syntheses/generate', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ director, author: 'IA' }),
            });
            const payload = await response.json();
            if (!response.ok) {
              showFeedback(payload.error || 'Não foi possível gerar as sínteses.', true);
              return;
            }
            const items = Array.isArray(payload) ? payload : [payload];
            items.forEach((entry) => updateCard(entry.group, entry));
            showFeedback('Sínteses geradas por IA para os três públicos.');
          } catch {
            showFeedback('Falha de comunicação ao gerar as sínteses por IA.', true);
          } finally {
            generateBtn.disabled = false;
            generateBtn.textContent = 'Gerar síntese por IA';
          }
        });
      })();
    </script>`}</body></html>`;
  }

  return async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    try {
      const hostHeader = request.headers.host ?? "localhost";
      const url = new URL(request.url ?? "/", `http://${hostHeader}`);
      const method = request.method ?? "GET";

      if (basePath) {
        if (!url.pathname.startsWith(`${basePath}/`)) {
          writeText(response, 404, "Página não encontrada.");
          return;
        }
        url.pathname = url.pathname.slice(basePath.length);
      }

      if ((readOnly || !synthesisStore) && (url.pathname === "/api/syntheses" || url.pathname.startsWith("/api/syntheses/"))) {
        writeJson(response, method === "GET" ? 404 : 405, { error: "Painel público somente para consulta." });
        return;
      }

      if (url.pathname === "/assets/logotipo.png") {
        if (method !== "GET") {
          writeText(response, 405, "Método não permitido.", { allow: "GET" });
          return;
        }
        if (!brandLogoBuffer) {
          writeText(response, 404, "Logotipo não encontrado.");
          return;
        }
        response.writeHead(200, {
          ...securityHeaders,
          "content-type": "image/png",
          "cache-control": "public, max-age=86400",
        });
        response.end(brandLogoBuffer);
        return;
      }

      if (synthesisStore && url.pathname === "/api/syntheses/generate") {
        if (method !== "POST") {
          writeJson(response, 405, { error: "Método não permitido." }, { allow: "POST" });
          return;
        }
        assertSameOriginPost(request);
        const body = await readJsonBody(request);
        const director = typeof body.director === "string" ? body.director : "";
        if (!directorSet.has(director)) {
          throw new HttpError(400, "Diretor não reconhecido.");
        }
        const requestedGroup = body.group;
        let targetGroups: RespondentGroup[];
        if (requestedGroup === undefined || requestedGroup === "") {
          targetGroups = [...respondentGroups];
        } else if (isRespondentGroup(requestedGroup)) {
          targetGroups = [requestedGroup];
        } else {
          throw new HttpError(400, "Público não reconhecido.");
        }
        const author =
          typeof body.author === "string" && body.author.trim() ? body.author.trim() : "IA";

        if (generatingDirectors.has(director)) {
          throw new HttpError(409, "Já existe uma geração por IA em andamento para este diretor.");
        }
        generatingDirectors.add(director);
        try {
          const dashboard = dashboardsByDirector.get(director)!;
          const generated = await Promise.all(
            targetGroups.map(async (group) => {
              const summary = dashboard.groups[group];
              const questions = summary.questions ?? [];
              const topQuestions = [...questions]
                .sort((a, b) => b.mean - a.mean || b.validCount - a.validCount)
                .slice(0, 5);
              const lowestQuestions = [...questions]
                .filter((item) => item.mean < summary.overall.scale.max)
                .sort((a, b) => a.mean - b.mean || b.validCount - a.validCount)
                .slice(0, 5);
              const content = await generateSynthesis(
                {
                  director,
                  group,
                  submissions: summary.submissions,
                  validCount: summary.overall.validCount,
                  mean: summary.overall.mean,
                  scale: summary.overall.scale,
                  disclosureThreshold: summary.overall.disclosureThreshold,
                  limitation: summary.overall.note,
                  topQuestions,
                  lowestQuestions,
                },
                aiProvider,
              );
              return { group, content };
            }),
          );
          const created: StoredSynthesis[] = [];
          for (const item of generated) {
            created.push(
              await synthesisStore.create(director, item.group, item.content, author, "ia"),
            );
          }
          writeJson(response, 201, requestedGroup ? created[0] : created);
        } finally {
          generatingDirectors.delete(director);
        }
        return;
      }

      if (synthesisStore && url.pathname === "/api/syntheses") {
        if (method === "GET") {
          const director = url.searchParams.get("director") ?? "";
          const group = url.searchParams.get("group") ?? "";
          writeJson(response, 200, versionsFor(await readSyntheses(), director, group));
          return;
        }
        if (method === "POST") {
          assertSameOriginPost(request);
          const body = await readJsonBody(request);
          const director = typeof body.director === "string" ? body.director : "";
          if (!directorSet.has(director)) {
            throw new HttpError(400, "Diretor não reconhecido.");
          }
          if (!isRespondentGroup(body.group)) {
            throw new HttpError(400, "Público não reconhecido.");
          }
          const created = await synthesisStore.create(
            director,
            body.group,
            body.content as ReportSynthesis,
            body.author as string,
          );
          writeJson(response, 201, created);
          return;
        }
        writeJson(response, 405, { error: "Método não permitido." }, { allow: "GET, POST" });
        return;
      }

      if (synthesisStore && url.pathname === "/api/syntheses/approve") {
        if (method !== "POST") {
          writeJson(response, 405, { error: "Método não permitido." }, { allow: "POST" });
          return;
        }
        assertSameOriginPost(request);
        const body = await readJsonBody(request);
        const director = typeof body.director === "string" ? body.director : "";
        if (!directorSet.has(director)) {
          throw new HttpError(400, "Diretor não reconhecido.");
        }
        if (!isRespondentGroup(body.group)) {
          throw new HttpError(400, "Público não reconhecido.");
        }
        const version = Number(body.version);
        if (!Number.isInteger(version) || version < 1) {
          throw new HttpError(400, "Número da versão inválido.");
        }
        const note = body.note === undefined ? "" : body.note;
        if (typeof note !== "string") {
          throw new HttpError(400, "Observação da aprovação deve ser texto.");
        }
        const approved = await synthesisStore.approve(director, body.group, version, note);
        writeJson(response, 200, approved);
        return;
      }

      if (url.pathname === "/api/directors") {
        if (method !== "GET") {
          writeJson(response, 405, { error: "Método não permitido." }, { allow: "GET" });
          return;
        }
        writeJson(response, 200, { directors });
        return;
      }

      if (url.pathname === "/api/dashboard") {
        if (method !== "GET") {
          writeJson(response, 405, { error: "Método não permitido." }, { allow: "GET" });
          return;
        }
        const requested = url.searchParams.get("director") ?? directors[0];
        const director = directorSet.has(requested) ? requested : directors[0];
        writeJson(response, 200, dashboardsByDirector.get(director));
        return;
      }

      if (url.pathname === "/report.pdf") {
        if (method !== "GET") {
          writeText(response, 405, "Método não permitido.", { allow: "GET" });
          return;
        }
        const requested = url.searchParams.get("director") ?? directors[0];
        const director = directorSet.has(requested) ? requested : directors[0];
        const report = buildReportForDirector(director, await readSyntheses());
        const pdf = await renderFeedbackPdf(report);
        response.writeHead(200, {
          ...securityHeaders,
          "content-type": "application/pdf",
          "content-disposition": buildContentDisposition("devolutiva", director, "pdf"),
        });
        response.end(pdf);
        return;
      }

      if (url.pathname === "/reports.zip") {
        if (method !== "GET") {
          writeText(response, 405, "Método não permitido.", { allow: "GET" });
          return;
        }
        const files: Record<string, Uint8Array> = {};
        const usedNames = new Set<string>();
        const entries = await readSyntheses();
        for (const director of directors) {
          const report = buildReportForDirector(director, entries);
          const pdf = await renderFeedbackPdf(report);
          let slug = sanitizeAsciiFilename(director);
          let suffix = 2;
          while (usedNames.has(slug)) {
            slug = `${sanitizeAsciiFilename(director)}-${suffix++}`;
          }
          usedNames.add(slug);
          files[`devolutiva-${slug}.pdf`] = new Uint8Array(pdf);
        }
        const zipBytes = zipSync(files, { level: 6 });
        response.writeHead(200, {
          ...securityHeaders,
          "content-type": "application/zip",
          "content-disposition":
            'attachment; filename="devolutivas-diretores-fraiburgo.zip"',
        });
        response.end(Buffer.from(zipBytes));
        return;
      }

      if (url.pathname === "/") {
        if (method !== "GET") {
          writeText(response, 405, "Método não permitido.", { allow: "GET" });
          return;
        }
        const requested = url.searchParams.get("director") ?? directors[0];
        const director = directorSet.has(requested) ? requested : directors[0];
        const html = renderPage(director, await readSyntheses());
        response.writeHead(200, {
          ...securityHeaders,
          "content-type": "text/html; charset=utf-8",
        });
        response.end(html);
        return;
      }

      if (url.pathname.startsWith("/api/")) {
        writeJson(response, 404, { error: "Recurso não encontrado." });
      } else {
        writeText(response, 404, "Página não encontrada.");
      }
    } catch (error) {
      if (error instanceof HttpError) {
        writeJson(response, error.statusCode, { error: error.message });
        return;
      }
      if (error instanceof Error) {
        const isClientValidation =
          error.message.includes("obrigatórios") ||
          error.message.includes("excede o limite") ||
          error.message.includes("texto válido") ||
          error.message.includes("não encontrada") ||
          error.message.includes("IA não configurada") ||
          error.message.includes("gerar a síntese por IA");
        if (isClientValidation) {
          writeJson(response, 400, { error: error.message });
          return;
        }
      }
      console.error("[server] Erro interno:", error);
      writeJson(response, 500, { error: "Erro interno ao processar a solicitação." });
    }
  };
}
