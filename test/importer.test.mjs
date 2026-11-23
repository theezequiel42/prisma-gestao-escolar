import test from "node:test";
import assert from "node:assert/strict";
import { buildDirectorDashboard } from "../dist/dashboard.js";
import { inspectWorkbook, readAssessmentRecords } from "../dist/importer.js";

test("reconhece a planilha inicial e mantém o estado em revisão", async () => {
  const result = await inspectWorkbook(
    "avaliacao_diretores_2026_unificada_sem_nome_cpf.xlsx",
  );

  assert.equal(result.responseCount, 2202);
  assert.equal(result.directorCount, 27);
  assert.equal(result.questionMap.length, 230);
  assert.equal(result.questionMap[0].lot, "Anos Iniciais");
  assert.equal(result.status, "em_revisao");
  assert.equal(result.issues.some((item) => item.severity === "erro"), false);
});

test("calcula médias para todos os 27 diretores e públicos da planilha 2026", async () => {
  const records = await readAssessmentRecords(
    "avaliacao_diretores_2026_unificada_sem_nome_cpf.xlsx",
  );
  const directors = [...new Set(records.map((record) => record.director))].sort();

  assert.equal(records.length, 2202);
  assert.equal(directors.length, 27);

  for (const director of directors) {
    const dashboard = buildDirectorDashboard(records, director);
    for (const group of ["professores", "funcionarios", "pais_responsaveis"]) {
      const summary = dashboard.groups[group];
      assert.ok(
        summary.submissions >= 1,
        `${director} (${group}) deveria ter ao menos 1 submissão`,
      );
      assert.equal(
        summary.overall.disclosed,
        true,
        `${director} (${group}) deveria divulgar a média`,
      );
      assert.equal(
        typeof summary.overall.mean,
        "number",
        `${director} (${group}) deveria ter média numérica`,
      );
    }
  }
});
