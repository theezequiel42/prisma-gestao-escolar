import { createServer } from "node:http";
import { buildDirectorDashboard } from "./dashboard.ts";
import { readAssessmentRecords } from "./importer.ts";

const sourceFile =
  process.argv[2] ?? "avaliacao_diretores_2026_unificada_sem_nome_cpf.xlsx";
const port = Number(process.env.PORT ?? 3000);
const records = await readAssessmentRecords(sourceFile);
const directors = [...new Set(records.map((record) => record.director))].sort();
const answerKey = Object.keys(records[0]?.answers ?? {})[0];
if (!answerKey) {
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
  const dashboard = buildDirectorDashboard(records, selectedDirector, answerKey);
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

createServer((request, response) => {
  const url = new URL(request.url ?? "/", `http://localhost:${port}`);
  const selectedDirector = url.searchParams.get("director") ?? directors[0];
  response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  response.end(page(directors.includes(selectedDirector) ? selectedDirector : directors[0]));
}).listen(port, () => {
  console.log(`Dashboard disponível em http://localhost:${port}`);
});
