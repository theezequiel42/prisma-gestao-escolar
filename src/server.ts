import { createServer } from "node:http";
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
  pais_responsaveis: "Pais e responsáveis",
};

function page(selectedDirector: string): string {
  const dashboard = buildDirectorDashboard(records, selectedDirector);
  const cards = Object.values(dashboard.groups)
    .map(
      (group) => `
        <article class="card">
          <h2>${escapeHtml(groupLabels[group.group] ?? group.group)}</h2>
          <p>Participantes: <strong>${group.submissions}</strong></p>
          <p>Média: <strong>${group.overall.mean ?? "indisponível"}</strong></p>
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
      return `
        <article class="card synthesis">
          <h2>Síntese — ${escapeHtml(groupLabels[group] ?? group)}</h2>
          <p>Última versão: <strong>${latest ? `${latest.version} (${latest.status})` : "nenhuma"}</strong></p>
          <form onsubmit="submitSynthesis(event, '${escapeHtml(group)}')">
            <input name="author" placeholder="Responsável" value="${escapeHtml(latest?.author ?? "")}" required>
            <textarea name="perception" placeholder="Percepção predominante" required>${escapeHtml(latestContent?.perception ?? "")}</textarea>
            <textarea name="strength" placeholder="Ponto forte" required>${escapeHtml(latestContent?.strength ?? "")}</textarea>
            <textarea name="attention" placeholder="Aspecto de atenção" required>${escapeHtml(latestContent?.attention ?? "")}</textarea>
            <button type="submit">Salvar ajustes</button>
          </form>
          ${
            latest && latest.status === "rascunho"
              ? `<form onsubmit="approveSynthesis(event, '${escapeHtml(group)}', ${latest.version})">
                  <input name="note" placeholder="Observação da aprovação (opcional)">
                  <button type="submit">Aprovar síntese</button>
                </form>`
              : ""
          }
        </article>`;
    })
    .join("");
  return `<!doctype html>
    <html lang="pt-BR"><head><meta charset="utf-8"><title>Avaliação de Diretores</title>
    <style>body{font:16px system-ui;max-width:1000px;margin:2rem auto;padding:0 1rem;color:#172033}
    .toolbar{display:flex;flex-wrap:wrap;gap:1rem;align-items:center;justify-content:space-between}
    .cards{display:grid;grid-template-columns:repeat(3,1fr);gap:1rem}.card{border:1px solid #ccd3df;border-radius:8px;padding:1rem}
    .notice{background:#fff4d6;padding:1rem;border-radius:8px}textarea,input{display:block;width:100%;box-sizing:border-box;margin:.5rem 0;padding:.5rem}textarea{min-height:4rem}
    button,.btn{display:inline-block;padding:.5rem .75rem;cursor:pointer;text-decoration:none;border:1px solid #172033;border-radius:6px;background:#fff;color:#172033}
    @media(max-width:700px){.cards{grid-template-columns:1fr}}</style>
    </head><body><h1>Avaliação de Diretores</h1>
    <div class="toolbar">
      <form><label for="director">Diretor(a): </label><select id="director" name="director" onchange="this.form.submit()">
      ${directors.map((director) => `<option ${director === selectedDirector ? "selected" : ""}>${escapeHtml(director)}</option>`).join("")}
      </select></form>
      <a class="btn" href="/report.pdf?director=${encodeURIComponent(selectedDirector)}">Baixar devolutiva (PDF)</a>
    </div>
    <p class="notice">Ajuste e aprove as sínteses diretamente nesta tela. Os PDFs de devolutiva gerados serão encaminhados externamente.</p>
    <section class="cards">${cards}</section>
    <div class="toolbar">
      <h2>Sínteses por público</h2>
      <button type="button" onclick="generateAllSyntheses(event)">Gerar síntese por IA</button>
    </div>
    <section class="cards">${synthesisForms}</section>
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
