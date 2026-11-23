import { createServer } from "node:http";
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
const answerKeys = Object.fromEntries(
  records.map((record) => [record.group, Object.keys(record.answers)[0]]),
);
if (Object.keys(answerKeys).length === 0) {
  throw new Error("Nenhuma pergunta reconhecida para montar o dashboard.");
}

function escapeHtml(value: unknown): string {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function page(selectedDirector: string): string {
  const dashboard = buildDirectorDashboard(records, selectedDirector, answerKeys);
  const cards = Object.values(dashboard.groups)
    .map(
      (group) => `
        <article class="card">
          <h2>${escapeHtml(group.group)}</h2>
          <p>Submissões: <strong>${group.submissions}</strong></p>
          <p>Média: <strong>${group.overall.mean ?? "indisponível"}</strong></p>
          <small>${escapeHtml(
            group.overall.note ??
              `${group.overall.validCount} respostas válidas na escala ${group.overall.scale.min}–${group.overall.scale.max}.`,
          )}</small>
        </article>`,
    )
    .join("");
  return `<!doctype html>
    <html lang="pt-BR"><head><meta charset="utf-8"><title>Avaliação de Diretores</title>
    <style>body{font:16px system-ui;max-width:1000px;margin:2rem auto;padding:0 1rem;color:#172033}
    .cards{display:grid;grid-template-columns:repeat(3,1fr);gap:1rem}.card{border:1px solid #ccd3df;border-radius:8px;padding:1rem}
    .notice{background:#fff4d6;padding:1rem;border-radius:8px}@media(max-width:700px){.cards{grid-template-columns:1fr}}</style>
    </head><body><h1>Avaliação de Diretores</h1>
    <form><label for="director">Diretor(a): </label><select id="director" name="director" onchange="this.form.submit()">
    ${directors.map((director) => `<option ${director === selectedDirector ? "selected" : ""}>${escapeHtml(director)}</option>`).join("")}
    </select></form><p class="notice">Prévia em revisão. Médias com menos de cinco respostas válidas permanecem indisponíveis.</p>
    <section class="cards">${cards}</section></body></html>`;
}

async function requestBody(request: import("node:http").IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", `http://localhost:${port}`);
  const selectedDirector = url.searchParams.get("director") ?? directors[0];
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
  if (url.pathname === "/api/syntheses/review" && request.method === "POST") {
    try {
      const body = (await requestBody(request)) as {
        director: string;
        group: string;
        version: number;
        decision: "aprovar" | "devolver";
        note: string;
      };
      const reviewed = await synthesisStore.review(
        body.director,
        body.group,
        body.version,
        body.decision,
        body.note,
      );
      response.writeHead(200, { "content-type": "application/json; charset=utf-8" });
      response.end(JSON.stringify(reviewed));
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
    response.end(JSON.stringify(buildDirectorDashboard(records, director, answerKeys)));
    return;
  }
  if (url.pathname === "/report.pdf") {
    const director = directors.includes(selectedDirector) ? selectedDirector : directors[0];
    const dashboard = buildDirectorDashboard(records, director, answerKeys);
    const report = buildFeedbackReport(
      dashboard,
      checkPublication(
        {
          sourceFile,
          responseSheet: "Dados unificados",
          responseCount: records.length,
          directorCount: directors.length,
          groups: {},
          sheets: [],
          issues: [],
          status: "em_revisao",
        },
        {
          meanRuleApproved: false,
          confidentialityThresholdApproved: false,
          questionClassificationApproved: false,
          reviewersAssigned: false,
        },
      ),
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
