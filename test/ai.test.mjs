import test from "node:test";
import assert from "node:assert/strict";
import { generateSynthesis } from "../dist/ai.js";

test("gera síntese estruturada por um provider mockado", async () => {
  const content = await generateSynthesis(
    {
      director: "Diretora A",
      group: "professores",
      submissions: 62,
      validCount: 58,
      mean: 4.2,
      scale: { min: 1, max: 5 },
      disclosureThreshold: 5,
      limitation: null,
    },
    {
      async generate() {
        return {
          perception: "A percepção predominante é favorável.",
          strength: "Há concentração nas notas mais altas.",
          attention: "A distribuição merece acompanhamento.",
        };
      },
    },
  );

  assert.equal(content.perception, "A percepção predominante é favorável.");
});

test("exige configuração antes de chamar provider padrão", async () => {
  const oldKey = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  delete process.env.AI_API_KEY;
  try {
    await assert.rejects(
      () => generateSynthesis({
        director: "A",
        group: "funcionarios",
        submissions: 1,
        validCount: 1,
        mean: null,
        scale: { min: 1, max: 5 },
        disclosureThreshold: 5,
        limitation: "Dados insuficientes.",
      }),
      /IA não configurada/,
    );
  } finally {
    if (oldKey) process.env.OPENAI_API_KEY = oldKey;
  }
});

test("usa o modelo Gemini por configuração compatível", async () => {
  const originalKey = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = "chave-de-teste";
  process.env.AI_PROVIDER = "gemini";
  process.env.AI_MODEL = "gemini-2.5-flash";
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    assert.match(String(url), /generativelanguage\.googleapis\.com/);
    assert.match(init?.headers?.authorization, /Bearer chave-de-teste/);
    const body = JSON.parse(init?.body);
    assert.equal(body.model, "gemini-2.5-flash");
    assert.match(body.messages[1].content, /linguagem simples/i);
    assert.match(body.messages[1].content, /Pontos mais bem avaliados/);
    return new Response(
      JSON.stringify({
        choices: [{
          message: {
            content: JSON.stringify({
              perception: "Percepção gerada.",
              strength: "Ponto forte.",
              attention: "Atenção necessária.",
            }),
          },
        }],
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };
  try {
    const result = await generateSynthesis({
      director: "Diretora A",
      group: "professores",
      submissions: 62,
      validCount: 58,
      mean: 4.2,
      scale: { min: 1, max: 5 },
      disclosureThreshold: 5,
      limitation: null,
    });
    assert.equal(result.perception, "Percepção gerada.");
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.AI_PROVIDER;
    delete process.env.AI_MODEL;
    if (originalKey) process.env.GEMINI_API_KEY = originalKey;
    else delete process.env.GEMINI_API_KEY;
  }
});
