import test from "node:test";
import assert from "node:assert/strict";
import { calculateIndicator } from "../dist/metrics.js";

test("calcula média somente com notas válidas e explicita o denominador", () => {
  const result = calculateIndicator([1, 2, 3, 4, 5, null, 0, 6, "5"]);

  assert.equal(result.validCount, 5);
  assert.equal(result.mean, 3);
  assert.equal(result.disclosed, true);
  assert.deepEqual(result.scale, { min: 1, max: 5 });
});

test("calcula média independentemente de quantidade mínima de respostas por padrão", () => {
  const result = calculateIndicator([4]);

  assert.equal(result.validCount, 1);
  assert.equal(result.mean, 4);
  assert.equal(result.disclosed, true);
  assert.equal(result.disclosureThreshold, 1);
  assert.equal(result.note, null);
});

test("retorna indisponível apenas quando não há respostas válidas", () => {
  const result = calculateIndicator([null, 0, 6, "5"]);

  assert.equal(result.validCount, 0);
  assert.equal(result.mean, null);
  assert.equal(result.disclosed, false);
  assert.match(result.note, /não há respostas válidas/);
});

test("oculta indicador quando limite mínimo é exigido explicitamente", () => {
  const result = calculateIndicator([4, 5, null, 0], { minimum: 5 });

  assert.equal(result.validCount, 2);
  assert.equal(result.mean, null);
  assert.equal(result.disclosed, false);
  assert.match(result.note, /pelo menos 5/);
});
