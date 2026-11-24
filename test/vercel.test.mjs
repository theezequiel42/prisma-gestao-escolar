import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";

test("entrada da Vercel mantém o painel público e exige senha nas rotas administrativas", async (t) => {
  const previousPassword = process.env.ADMIN_PASSWORD;
  const previousDatabase = process.env.DATABASE_URL;
  process.env.ADMIN_PASSWORD = "senha-descartavel-para-teste-unitario";
  process.env.DATABASE_URL = "postgresql://test@127.0.0.1:1/test";
  t.after(() => {
    if (previousPassword === undefined) delete process.env.ADMIN_PASSWORD;
    else process.env.ADMIN_PASSWORD = previousPassword;
    if (previousDatabase === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousDatabase;
  });
  const { default: handler } = await import("../dist/vercel.js");
  assert.equal(typeof handler, "function");
  const server = createServer(handler);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  try {
    const response = await fetch(`${url}/`);
    assert.equal(response.status, 200);
    const page = await response.text();
    assert.match(page, /consulta pública/i);
    assert.doesNotMatch(page, /Salvar ajustes|Gerar síntese por IA/);
    assert.equal((await fetch(`${url}/api/directors`)).status, 200);
    for (const route of ["/api/syntheses", "/api/syntheses/generate", "/api/syntheses/approve"]) {
      assert.equal((await fetch(url + route, { method: "POST" })).status, 405);
      assert.equal((await fetch(`${url}/admin${route}`, { method: "POST" })).status, 401);
    }
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});