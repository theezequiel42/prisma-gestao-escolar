import test from "node:test";
import assert from "node:assert/strict";
import { buildDirectorDashboard } from "../dist/dashboard.js";
import { checkPublication } from "../dist/validation.js";

const baseImport = {
  sourceFile: "base.xlsx",
  responseSheet: "Dados",
  responseCount: 6,
  directorCount: 1,
  groups: {},
  sheets: [],
  issues: [],
  status: "em_revisao",
};

test("dashboard mantém os três públicos e calcula médias mesmo com poucas respostas", () => {
  const records = [
    ...Array.from({ length: 5 }, () => ({
      director: "Diretora A",
      group: "professores",
      answers: { q1: 4 },
      cycle: "2026",
    })),
    {
      director: "Diretora A",
      group: "funcionarios",
      answers: { q1: 5 },
      cycle: "2026",
    },
  ];
  const dashboard = buildDirectorDashboard(records, "Diretora A", "q1");

  assert.deepEqual(Object.keys(dashboard.groups), [
    "professores",
    "funcionarios",
    "pais_responsaveis",
  ]);
  assert.equal(dashboard.groups.professores.overall.mean, 4);
  assert.equal(dashboard.groups.funcionarios.overall.mean, 5);
  assert.equal(dashboard.groups.funcionarios.overall.disclosed, true);
  assert.equal(dashboard.groups.pais_responsaveis.submissions, 0);
  assert.equal(dashboard.groups.pais_responsaveis.overall.mean, null);
});

test("dashboard respeita mínimo explícito quando informado", () => {
  const records = [
    {
      director: "Diretora A",
      group: "funcionarios",
      answers: { q1: 5 },
      cycle: "2026",
    },
  ];
  const dashboard = buildDirectorDashboard(records, "Diretora A", "q1", 5);

  assert.equal(dashboard.groups.funcionarios.overall.mean, null);
  assert.equal(dashboard.groups.funcionarios.overall.disclosed, false);
});

test("dashboard agrega todas as perguntas respondidas quando answerKey é omitido", () => {
  const records = [
    {
      director: "Diretora C",
      group: "professores",
      answers: { q1: 4, q2: 5 },
    },
    {
      director: "Diretora C",
      group: "funcionarios",
      answers: { f1: 3, f2: 4 },
    },
  ];
  const dashboard = buildDirectorDashboard(records, "Diretora C");

  assert.equal(dashboard.groups.professores.submissions, 1);
  assert.equal(dashboard.groups.professores.overall.validCount, 2);
  assert.equal(dashboard.groups.professores.overall.mean, 4.5);
  assert.equal(dashboard.groups.funcionarios.submissions, 1);
  assert.equal(dashboard.groups.funcionarios.overall.mean, 3.5);
});

test("publicação permanece bloqueada sem decisões institucionais", () => {
  const result = checkPublication(baseImport, {
    meanRuleApproved: false,
    confidentialityThresholdApproved: false,
    questionClassificationApproved: false,
  });

  assert.equal(result.state, "em_revisao");
  assert.equal(result.blockers.length, 2);
  assert.equal(result.warnings.length, 1);
});

test("usa a pergunta correspondente de cada público", () => {
  const dashboard = buildDirectorDashboard(
    [
      ...Array.from({ length: 5 }, () => ({
        director: "Diretora B",
        group: "professores",
        answers: { professores_q1: 4 },
      })),
      ...Array.from({ length: 5 }, () => ({
        director: "Diretora B",
        group: "funcionarios",
        answers: { funcionarios_q1: 3 },
      })),
    ],
    "Diretora B",
    {
      professores: "professores_q1",
      funcionarios: "funcionarios_q1",
    },
  );

  assert.equal(dashboard.groups.professores.overall.mean, 4);
  assert.equal(dashboard.groups.funcionarios.overall.mean, 3);
});
