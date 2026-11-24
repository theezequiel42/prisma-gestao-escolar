import { createApp } from "./app.ts";
import { readAssessmentRecords } from "./importer.ts";
import { SynthesisStore } from "./store.ts";

const sourceFile =
  process.argv[2] ?? "avaliacao_diretores_2026_unificada_sem_nome_cpf.xlsx";
const host = process.env.HOST ?? "127.0.0.1";
const port = Number(process.env.PORT ?? 3000);

const records = await readAssessmentRecords(sourceFile);
const synthesisStore = new SynthesisStore(
  process.env.SYNTHESIS_STORE ?? ".data/syntheses.json",
);
await synthesisStore.load();

const server = createApp({
  records,
  synthesisStore,
  sourceFile,
});

server.listen(port, host, () => {
  console.log(`Dashboard disponível em http://${host}:${port}`);
});
