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

test("oculta indicador de grupo abaixo do limite de confidencialidade", () => {
  const result = calculateIndicator([4, 5, null, 0], { minimum: 5 });

  assert.equal(result.validCount, 2);
  assert.equal(result.mean, null);
  assert.equal(result.disclosed, false);
  assert.match(result.note, /pelo menos 5/);
});
