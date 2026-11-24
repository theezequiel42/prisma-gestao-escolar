import { existsSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { generateSynthesis } from "./ai.ts";
import { buildDirectorDashboard } from "./dashboard.ts";
import { readAssessmentRecords } from "./importer.ts";
import { renderFeedbackPdf } from "./pdf.ts";
import { buildFeedbackReport } from "./report.ts";
import { SynthesisStore } from "./store.ts";
import { checkPublication } from "./validation.ts";

const sourceFile =
  process.argv[2] ?? "avaliacao_diretores_2026_unificada_sem_nome_cpf.xlsx";
const port = Number(process.env.PORT ?? 3000);
const records = await readAssessmentRecords(sourceFile);
const synthesisStore = new SynthesisStore(
  process.env.SYNTHESIS_STORE ?? ".data/syntheses.json",
);
await synthesisStore.load();
const directors = [...new Set(records.map((record) => record.director))].sort();
if (directors.length === 0) {
  throw new Error("Nenhum diretor reconhecido para montar o dashboard.");
}

function escapeHtml(value: unknown): string {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

const groupLabels: Record<string, string> = {
  professores: "Professores",
  funcionarios: "Funcionários",
  pais_responsaveis: "Pais / Responsáveis",
};

function loadLogoFile(): Buffer | null {
  const candidates = [
    fileURLToPath(new URL("../assets/logotipo.png", import.meta.url)),
    fileURLToPath(new URL("../../assets/logotipo.png", import.meta.url)),
  ];
  for (const path of candidates) {
    if (existsSync(path)) return readFileSync(path);
  }
  return null;
}

const brandLogoBuffer = loadLogoFile();

function formatMeanBr(value: number | null): string {
  return value === null ? "indisponível" : value.toFixed(2).replace(".", ",");
}

function page(selectedDirector: string): string {
  const dashboard = buildDirectorDashboard(records, selectedDirector);
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
  const synthesisForms = Object.keys(dashboard.groups)
    .map((group) => {
      const versions = synthesisStore.list(selectedDirector, group);
      const latest = versions.at(-1);
      const latestContent = latest?.content;
      const statusClass = latest?.status === "aprovada" ? "badge-approved" : "badge-draft";
      return `
        <article class="card synthesis syn-${escapeHtml(group)}">
          <div class="syn-header">
            <h3>${escapeHtml(groupLabels[group] ?? group)}</h3>
            <span class="badge ${latest ? statusClass : "badge-empty"}">${
              latest ? `v${latest.version} · ${escapeHtml(latest.status)}` : "sem síntese"
            }</span>
          </div>
          <form onsubmit="submitSynthesis(event, '${escapeHtml(group)}')">
            <label>Responsável
              <input name="author" placeholder="Nome do responsável" value="${escapeHtml(latest?.author ?? "")}" required>
            </label>
            <label>Impressão geral
              <textarea name="perception" placeholder="Como este público percebe a gestão no dia a dia" required>${escapeHtml(latestContent?.perception ?? "")}</textarea>
            </label>
            <label>Ponto forte
              <textarea name="strength" placeholder="O que mais se destacou positivamente" required>${escapeHtml(latestContent?.strength ?? "")}</textarea>
            </label>
            <label>Aspecto de atenção
              <textarea name="attention" placeholder="Pontos que merecem mais diálogo ou cuidado" required>${escapeHtml(latestContent?.attention ?? "")}</textarea>
            </label>
            <button type="submit" class="btn-outline">Salvar ajustes</button>
          </form>
          ${
            latest && latest.status === "rascunho"
              ? `<form class="approve-form" onsubmit="approveSynthesis(event, '${escapeHtml(group)}', ${latest.version})">
                  <input name="note" placeholder="Observação da aprovação (opcional)">
                  <button type="submit" class="btn-approve">Aprovar síntese</button>
                </form>`
              : ""
          }
        </article>`;
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
      select{font:inherit;padding:.5rem .75rem;border-radius:8px;border:1.5px solid #D3C6AC;background:#fff;color:var(--text);min-width:260px}
      select:focus,input:focus,textarea:focus{outline:2px solid var(--outono);border-color:var(--outono)}
      .notice{margin:1rem 0 1.25rem;background:var(--maca);border-left:5px solid var(--outono);color:var(--inverno);padding:.85rem 1.1rem;border-radius:8px;font-size:.93rem}
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
      .synthesis{display:flex;flex-direction:column;gap:.75rem;border-top-width:5px}
      .syn-professores{border-top-color:var(--verao)}
      .syn-funcionarios{border-top-color:var(--primavera)}
      .syn-pais_responsaveis{border-top-color:var(--outono)}
      .syn-header{display:flex;align-items:center;justify-content:space-between;gap:.5rem}
      .syn-header h3{margin:0;font-size:1.05rem;color:var(--inverno)}
      .badge{font-size:.76rem;font-weight:700;padding:.2rem .55rem;border-radius:999px;white-space:nowrap}
      .badge-approved{background:#E4EFE0;color:#3B5727}
      .badge-draft{background:#FCE9D9;color:#9C4A17}
      .badge-empty{background:#EFECE2;color:var(--muted)}
      .synthesis label{display:block;font-size:.82rem;font-weight:700;color:var(--inverno);margin:.45rem 0 .2rem}
      input,textarea{display:block;width:100%;margin:.25rem 0 .5rem;padding:.55rem .65rem;font:inherit;font-size:.9rem;border:1px solid #D3C6AC;border-radius:8px;background:#FFFEFA;color:var(--text)}
      textarea{min-height:4.6rem;resize:vertical}
      button,.btn{display:inline-flex;align-items:center;justify-content:center;gap:.4rem;font:inherit;font-size:.9rem;font-weight:700;padding:.58rem 1rem;cursor:pointer;text-decoration:none;border-radius:8px;border:1.5px solid transparent;transition:filter .15s ease,transform .05s ease}
      button:hover,.btn:hover{filter:brightness(1.06)}
      button:disabled{opacity:.65;cursor:wait}
      .btn-pdf{background:var(--verao);color:#fff}
      .btn-ai{background:var(--inverno);color:#fff}
      .btn-outline{background:#fff;color:var(--inverno);border-color:var(--inverno);width:100%}
      .btn-approve{background:var(--primavera);color:#fff;width:100%}
      .approve-form{border-top:1px dashed var(--border);padding-top:.65rem;margin-top:.2rem}
      @media(max-width:860px){.cards{grid-template-columns:1fr}.motto{text-align:left}}
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
    <main>
      <div class="toolbar">
        <form><label for="director">Diretor(a): </label><select id="director" name="director" onchange="this.form.submit()">
        ${directors.map((director) => `<option ${director === selectedDirector ? "selected" : ""}>${escapeHtml(director)}</option>`).join("")}
        </select></form>
        <a class="btn btn-pdf" href="/report.pdf?director=${encodeURIComponent(selectedDirector)}">Baixar devolutiva (PDF)</a>
      </div>
      <p class="notice">Ajuste e aprove as sínteses diretamente nesta tela. Os PDFs de devolutiva gerados seguem a identidade visual oficial de Fraiburgo para encaminhamento externo.</p>
      <section class="cards">${cards}</section>
      <div class="section-bar">
        <h2>Sínteses por público</h2>
        <button type="button" class="btn-ai" onclick="generateAllSyntheses(event)">Gerar síntese por IA</button>
      </div>
      <section class="cards">${synthesisForms}</section>
    </main>
    <script>
      async function generateAllSyntheses(event) {
        event.preventDefault();
        const button = event.currentTarget;
        button.disabled = true;
        button.textContent = 'Gerando sínteses...';
        try {
          const response = await fetch('/api/syntheses/generate', {
            method: 'POST', headers: {'content-type': 'application/json'},
            body: JSON.stringify({director: ${JSON.stringify(selectedDirector)}, author: 'IA'})
          });
          if (!response.ok) {
            alert((await response.json()).error ?? 'Não foi possível gerar as sínteses.');
            button.disabled = false;
            button.textContent = 'Gerar síntese por IA';
            return;
          }
          location.reload();
        } catch (error) {
          alert('Não foi possível gerar as sínteses.');
          button.disabled = false;
          button.textContent = 'Gerar síntese por IA';
        }
      }
      async function submitSynthesis(event, group) {
        event.preventDefault();
        const form = event.target;
        const data = Object.fromEntries(new FormData(form));
        const response = await fetch('/api/syntheses', {
          method: 'POST', headers: {'content-type': 'application/json'},
          body: JSON.stringify({director: ${JSON.stringify(selectedDirector)}, group,
            author: data.author, content: {perception: data.perception, strength: data.strength, attention: data.attention}})
        });
        if (!response.ok) { alert((await response.json()).error ?? 'Não foi possível salvar.'); return; }
        location.reload();
      }
      async function approveSynthesis(event, group, version) {
        event.preventDefault();
        const form = event.target;
        const data = Object.fromEntries(new FormData(form));
        const response = await fetch('/api/syntheses/approve', {
          method: 'POST', headers: {'content-type': 'application/json'},
          body: JSON.stringify({director: ${JSON.stringify(selectedDirector)}, group, version, note: data.note ?? ''})
        });
        if (!response.ok) { alert((await response.json()).error ?? 'Não foi possível aprovar.'); return; }
        location.reload();
      }
    </script></body></html>`;
}

async function requestBody(request: import("node:http").IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", `http://localhost:${port}`);
  if (url.pathname === "/assets/logotipo.png" && request.method === "GET") {
    if (!brandLogoBuffer) {
      response.writeHead(404);
      response.end();
      return;
    }
    response.writeHead(200, {
      "content-type": "image/png",
      "cache-control": "public, max-age=86400",
    });
    response.end(brandLogoBuffer);
    return;
  }
  const selectedDirector = url.searchParams.get("director") ?? directors[0];
  if (url.pathname === "/api/syntheses/generate" && request.method === "POST") {
    try {
      const body = (await requestBody(request)) as {
        director: string;
        group?: string;
        author?: string;
      };
      if (!directors.includes(body.director)) {
        throw new Error("Diretor não reconhecido.");
      }
      const dashboard = buildDirectorDashboard(records, body.director);
      const targetGroups = body.group ? [body.group] : Object.keys(dashboard.groups);
      for (const group of targetGroups) {
        if (!(group in dashboard.groups)) {
          throw new Error("Público não reconhecido.");
        }
      }
      const generated = await Promise.all(
        targetGroups.map(async (group) => {
          const summary = dashboard.groups[group as keyof typeof dashboard.groups];
          const questions = summary.questions ?? [];
          const topQuestions = [...questions]
            .sort((a, b) => b.mean - a.mean || b.validCount - a.validCount)
            .slice(0, 5);
          const lowestQuestions = [...questions]
            .filter((item) => item.mean < summary.overall.scale.max)
            .sort((a, b) => a.mean - b.mean || b.validCount - a.validCount)
            .slice(0, 5);
          const content = await generateSynthesis({
            director: body.director,
            group,
            submissions: summary.submissions,
            validCount: summary.overall.validCount,
            mean: summary.overall.mean,
            scale: summary.overall.scale,
            disclosureThreshold: summary.overall.disclosureThreshold,
            limitation: summary.overall.note,
            topQuestions,
            lowestQuestions,
          });
          return { group, content };
        }),
      );
      const created = [];
      for (const item of generated) {
        created.push(
          await synthesisStore.create(
            body.director,
            item.group,
            item.content,
            body.author?.trim() || "IA",
            "ia",
          ),
        );
      }
      response.writeHead(201, { "content-type": "application/json; charset=utf-8" });
      response.end(JSON.stringify(body.group ? created[0] : created));
    } catch (error) {
      response.writeHead(400, { "content-type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
    }
    return;
  }
  if (url.pathname === "/api/syntheses" && request.method === "GET") {
    const director = url.searchParams.get("director") ?? "";
    const group = url.searchParams.get("group") ?? "";
    response.writeHead(200, { "content-type": "application/json; charset=utf-8" });
    response.end(JSON.stringify(synthesisStore.list(director, group)));
    return;
  }
  if (url.pathname === "/api/syntheses" && request.method === "POST") {
    try {
      const body = (await requestBody(request)) as {
        director: string;
        group: string;
        content: { perception: string; strength: string; attention: string };
        author: string;
      };
      const created = await synthesisStore.create(
        body.director,
        body.group,
        body.content,
        body.author,
      );
      response.writeHead(201, { "content-type": "application/json; charset=utf-8" });
      response.end(JSON.stringify(created));
    } catch (error) {
      response.writeHead(400, { "content-type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
    }
    return;
  }
  if (url.pathname === "/api/syntheses/approve" && request.method === "POST") {
    try {
      const body = (await requestBody(request)) as {
        director: string;
        group: string;
        version: number;
        note?: string;
      };
      const approved = await synthesisStore.approve(
        body.director,
        body.group,
        body.version,
        body.note ?? "",
      );
      response.writeHead(200, { "content-type": "application/json; charset=utf-8" });
      response.end(JSON.stringify(approved));
    } catch (error) {
      response.writeHead(400, { "content-type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
    }
    return;
  }
  if (url.pathname === "/api/directors") {
    response.writeHead(200, { "content-type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ directors }));
    return;
  }
  if (url.pathname === "/api/dashboard") {
    const director = directors.includes(selectedDirector) ? selectedDirector : directors[0];
    response.writeHead(200, { "content-type": "application/json; charset=utf-8" });
    response.end(JSON.stringify(buildDirectorDashboard(records, director)));
    return;
  }
  if (url.pathname === "/report.pdf") {
    const director = directors.includes(selectedDirector) ? selectedDirector : directors[0];
    const dashboard = buildDirectorDashboard(records, director);
    const inferredCycle = dashboard.cycle ?? sourceFile.match(/\b(20\d{2})\b/)?.[1] ?? null;
    const syntheses = Object.fromEntries(
      Object.keys(dashboard.groups).map((group) => {
        const versions = synthesisStore.list(director, group);
        const preferred =
          [...versions].reverse().find((entry) => entry.status === "aprovada") ??
          versions.at(-1);
        return [group, preferred?.content ?? null];
      }),
    );
    const report = buildFeedbackReport(
      { ...dashboard, cycle: inferredCycle },
      checkPublication(
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
          meanRuleApproved: false,
          confidentialityThresholdApproved: false,
          questionClassificationApproved: false,
        },
      ),
      syntheses,
    );
    void renderFeedbackPdf(report).then((pdf) => {
      response.writeHead(200, {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="devolutiva-${encodeURIComponent(director)}.pdf"`,
      });
      response.end(pdf);
    }).catch((error: unknown) => {
      response.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
      response.end(`Não foi possível gerar a devolutiva: ${String(error)}`);
    });
    return;
  }
  response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  response.end(page(directors.includes(selectedDirector) ? selectedDirector : directors[0]));
}).listen(port, () => {
  console.log(`Dashboard disponível em http://localhost:${port}`);
});
