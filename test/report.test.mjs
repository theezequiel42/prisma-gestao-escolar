import test from "node:test";
import assert from "node:assert/strict";
import { buildDirectorDashboard } from "../dist/dashboard.js";
import { buildFeedbackReport } from "../dist/report.js";

test("devolutiva preserva recorte, versão e metodologia do dashboard", () => {
  const dashboard = buildDirectorDashboard(
    [
      ...Array.from({ length: 5 }, () => ({
        director: "Diretora A",
        group: "professores",
        answers: { q1: 4 },
        cycle: "2026",
        unit: "Escola A",
      })),
    ],
    "Diretora A",
    "q1",
  );
  const report = buildFeedbackReport(
    dashboard,
    {
      state: "preliminar",
      blockers: ["Aprovação pendente."],
      warnings: [],
    },
    {},
    "2026-01-01T00:00:00.000Z",
  );

  assert.equal(report.version, 1);
  assert.equal(report.director, "Diretora A");
  assert.equal(report.cycle, "2026");
  assert.equal(report.groups.professores.overall.mean, 4);
  assert.match(report.methodology.notes.join(" "), /Aprovação pendente/);
});
