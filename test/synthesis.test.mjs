import test from "node:test";
import assert from "node:assert/strict";
import { createSynthesisVersion, reviewSynthesis } from "../dist/synthesis.js";

test("cria e aprova uma versão de síntese com histórico", () => {
  const draft = createSynthesisVersion(
    {
      perception: "Percepção predominante.",
      strength: "Ponto forte observado.",
      attention: "Aspecto para acompanhamento.",
    },
    "Equipe de avaliação",
    2,
    "2026-01-01T00:00:00.000Z",
  );
  const approved = reviewSynthesis(draft, "aprovar", "Revisado pela equipe.");

  assert.equal(approved.version, 2);
  assert.equal(approved.status, "aprovada");
  assert.equal(approved.reviewNote, "Revisado pela equipe.");
});
