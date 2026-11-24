import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SynthesisStore } from "../dist/store.js";

test("persiste versões e decisões de revisão de sínteses", async () => {
  const directory = await mkdtemp(join(tmpdir(), "avaliacao-"));
  const path = join(directory, "syntheses.json");
  try {
    const store = new SynthesisStore(path);
    await store.load();
    await store.create(
      "Diretora A",
      "professores",
      {
        perception: "Percepção.",
        strength: "Força.",
        attention: "Atenção.",
      },
      "Equipe",
    );
    const approved = await store.approve(
      "Diretora A",
      "professores",
      1,
      "Aprovada.",
    );
    assert.equal(approved.status, "aprovada");
    const persisted = JSON.parse(await readFile(path, "utf8"));
    assert.equal(persisted[0].version, 1);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("serializa gravações concorrentes sem corromper o arquivo JSON", async () => {
  const directory = await mkdtemp(join(tmpdir(), "avaliacao-concurrent-"));
  const path = join(directory, "syntheses.json");
  try {
    const store = new SynthesisStore(path);
    await store.load();
    const results = await Promise.all([
      store.create(
        "Diretora A",
        "professores",
        { perception: "P1", strength: "F1", attention: "A1" },
        "Autor 1",
      ),
      store.create(
        "Diretora A",
        "professores",
        { perception: "P2", strength: "F2", attention: "A2" },
        "Autor 2",
      ),
      store.create(
        "Diretora A",
        "funcionarios",
        { perception: "P3", strength: "F3", attention: "A3" },
        "Autor 3",
      ),
    ]);
    assert.deepEqual(
      results.filter((entry) => entry.group === "professores").map((entry) => entry.version),
      [1, 2],
    );
    const persisted = JSON.parse(await readFile(path, "utf8"));
    assert.equal(persisted.length, 3);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
