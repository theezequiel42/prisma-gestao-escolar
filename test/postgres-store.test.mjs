import assert from "node:assert/strict";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { PostgresSynthesisStore } from "../dist/postgres-store.js";

function openDatabase(t) {
  const db = new PGlite();
  t.after(() => db.close());
  return db;
}

function storeFor(db) {
  return new PostgresSynthesisStore("", db.query.bind(db));
}

const content = { perception: "Visão", strength: "Força", attention: "Atenção" };

test("initializes only on private repository use, including multiple first callers", async (t) => {
  const db = openDatabase(t);
  const first = storeFor(db);
  const second = storeFor(db);
  const { rows } = await db.query("SELECT to_regclass('prisma_synthesis_versions') AS table_name");
  assert.equal(rows[0].table_name, null);
  assert.deepEqual(await Promise.all([first.listAll(), second.listAll(), first.listAll()]), [[], [], []]);
});

test("assigns gapless versions per director and group across concurrent stores", async (t) => {
  const db = openDatabase(t);
  const stores = [storeFor(db), storeFor(db), storeFor(db)];
  const authors = Array.from({ length: 24 }, (_, i) => `Autor ${i}`);
  const entries = await Promise.all(authors.map((author, i) =>
    stores[i % stores.length].create("D'Ávila", "professores", content, ` ${author} `, "ia"),
  ));
  const differentGroup = await stores[0].create("D'Ávila", "funcionários", content, "Equipe");
  const differentDirector = await stores[0].create("Outra direção", "professores", content, "Equipe");
  const persisted = (await storeFor(db).listAll()).filter(
    (entry) => entry.director === "D'Ávila" && entry.group === "professores",
  );
  assert.deepEqual(persisted.map(({ version }) => version), authors.map((_, i) => i + 1));
  assert.deepEqual(new Set(persisted.map(({ author }) => author)), new Set(authors));
  assert.deepEqual(persisted, [...entries].sort((a, b) => a.version - b.version));
  assert.deepEqual(entries[0], {
    director: "D'Ávila",
    group: "professores",
    version: entries[0].version,
    status: "rascunho",
    content,
    author: authors[0],
    createdAt: new Date(entries[0].createdAt).toISOString(),
    reviewNote: null,
    generatedBy: "ia",
  });
  assert.equal(differentGroup.version, 1);
  assert.equal(differentGroup.generatedBy, "humano");
  assert.equal(differentDirector.version, 1);
});

test("a failed create does not consume the next version", async (t) => {
  const db = openDatabase(t);
  const store = storeFor(db);
  await assert.rejects(store.create("Diretora", "Grupo", content, " "), /obrigatórios/);
  // PostgreSQL jsonb rejects embedded NUL even though the synthesis helper accepts it.
  await assert.rejects(store.create("Diretora", "Grupo", { ...content, attention: "a\0b" }, "Equipe"));
  const entry = await store.create("Diretora", "Grupo", content, "Equipe");
  assert.equal(entry.version, 1);
  assert.deepEqual(await store.listAll(), [entry]);
});

test("concurrent approvals and creates do not overwrite unrelated versions", async (t) => {
  const db = openDatabase(t);
  const [first, second] = [storeFor(db), storeFor(db)];
  const [draft1, draft2] = await Promise.all([
    first.create("Diretora", "Grupo", content, "Equipe A"),
    second.create("Diretora", "Grupo", content, "Equipe B"),
  ]);
  const [approval1, approval2, repeatedApproval, draft3] = await Promise.all([
    first.approve("Diretora", "Grupo", draft1.version, " Revisão A "),
    second.approve("Diretora", "Grupo", draft2.version, "Revisão B"),
    second.approve("Diretora", "Grupo", draft1.version, "Revisão C"),
    first.create("Diretora", "Grupo", content, "Equipe C"),
  ]);
  assert.deepEqual(approval1, { ...draft1, status: "aprovada", reviewNote: "Revisão A" });
  assert.deepEqual(approval2, { ...draft2, status: "aprovada", reviewNote: "Revisão B" });
  assert.deepEqual(repeatedApproval, { ...draft1, status: "aprovada", reviewNote: "Revisão C" });
  const persisted = await storeFor(db).listAll();
  assert.equal(draft3.version, 3);
  assert.deepEqual(persisted[2], draft3);
  assert.deepEqual(persisted[draft2.version - 1], approval2);
  assert.ok([approval1.reviewNote, repeatedApproval.reviewNote].includes(persisted[draft1.version - 1].reviewNote));
});

test("approval validates notes, distinguishes missing versions, and supports clearing the note", async (t) => {
  const db = openDatabase(t);
  const store = storeFor(db);
  const draft = await store.create("Diretora", "Grupo", content, "Equipe");
  await assert.rejects(store.approve("Diretora", "Outro", 1), /não encontrada/);
  await assert.rejects(store.approve("Diretora", "Grupo", 1.5), /não encontrada/);
  await assert.rejects(store.approve("Diretora", "Grupo", 1, "a".repeat(1001)), /limite máximo/);
  assert.deepEqual(await store.listAll(), [draft]);
  await store.approve("Diretora", "Grupo", 1, "Observação");
  const cleared = await store.approve("Diretora", "Grupo", 1);
  assert.deepEqual(cleared, { ...draft, status: "aprovada", reviewNote: null });
  assert.deepEqual(await store.listAll(), [cleared]);
});
