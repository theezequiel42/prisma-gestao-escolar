import test from "node:test";
import assert from "node:assert/strict";
import { inspectWorkbook } from "../dist/importer.js";

test("reconhece a planilha inicial e mantém o estado em revisão", async () => {
  const result = await inspectWorkbook(
    "avaliacao_diretores_2026_unificada_sem_nome_cpf.xlsx",
  );

  assert.equal(result.responseCount, 2202);
  assert.equal(result.directorCount, 27);
  assert.equal(result.status, "em_revisao");
  assert.equal(result.issues.some((item) => item.severity === "erro"), false);
});
