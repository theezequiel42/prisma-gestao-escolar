import test from "node:test";
import assert from "node:assert/strict";
import { approveSynthesis, createSynthesisVersion } from "../dist/synthesis.js";

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
  const approved = approveSynthesis(draft, "Revisado pela equipe.");

  assert.equal(approved.version, 2);
  assert.equal(approved.status, "aprovada");
  assert.equal(approved.reviewNote, "Revisado pela equipe.");
});

test("permite aprovar síntese sem observação obrigatória", () => {
  const draft = createSynthesisVersion(
    {
      perception: "Percepção predominante.",
      strength: "Ponto forte observado.",
      attention: "Aspecto para acompanhamento.",
    },
    "Equipe de avaliação",
  );
  const approved = approveSynthesis(draft);

  assert.equal(approved.status, "aprovada");
  assert.equal(approved.reviewNote, null);
});
