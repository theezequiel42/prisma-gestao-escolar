import test from "node:test";
import assert from "node:assert/strict";
import { renderFeedbackPdf } from "../dist/pdf.js";

test("gera PDF preliminar sem falhar quando há grupos protegidos", async () => {
  const pdf = await renderFeedbackPdf({
    version: 1,
    state: "em_revisao",
    issuedAt: "2026-01-01T00:00:00.000Z",
    director: "Diretora A",
    cycle: "2026",
    unit: null,
    groups: {
      professores: {
        group: "professores",
        submissions: 1,
        overall: {
          validCount: 1,
          mean: null,
          scale: { min: 1, max: 5 },
          disclosed: false,
          disclosureThreshold: 5,
          note: "Indicador indisponível.",
        },
      },
    },
    syntheses: {},
    methodology: {
      scale: { min: 1, max: 5 },
      disclosureThreshold: 5,
      notes: ["Documento preliminar."],
    },
  });

  assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
  assert.ok(pdf.length > 500);
});
