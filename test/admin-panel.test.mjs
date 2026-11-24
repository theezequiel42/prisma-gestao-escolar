import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { protectAdmin } from "../dist/admin.js";
import { createRequestHandler } from "../dist/app.js";

test("painel administrativo usa as próprias rotas e não divulga rascunhos no painel público", async () => {
  const records = [{ director: "Diretor Teste", group: "professores", answers: { "1. Diálogo": 5 } }];
  const privateEntry = { director: "Diretor Teste", group: "professores", version: 1,
    status: "rascunho", createdAt: "2026-11-24", author: "Admin", generatedBy: "humano",
    content: { perception: "Texto interno", strength: "Força", attention: "Revisar" } };
  const options = { records, sourceFile: "base.xlsx", synthesisStore: { async listAll() { return [privateEntry]; } } };
  const password = "senha-descartavel-para-teste-unitario";
  const server = createServer(protectAdmin(createRequestHandler({ ...options, readOnly: true }), {
    password, handler: createRequestHandler({ ...options, basePath: "/admin" }),
  }));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  try {
    const headers = { authorization: `Basic ${Buffer.from(`admin:${password}`).toString("base64")}` };
    const publicPage = await (await fetch(url, { headers })).text();
    assert.doesNotMatch(publicPage, /Texto interno|Salvar ajustes/);
    const admin = await fetch(`${url}/admin/?director=Diretor+Teste`, { headers });
    assert.equal(admin.status, 200);
    const page = await admin.text();
    assert.match(page, /Texto interno/);
    assert.match(page, /action="\/admin\/"/);
    assert.match(page, /fetch\('\/admin\/api\/syntheses\/generate'/);
    const list = await fetch(`${url}/admin/api/syntheses?director=Diretor+Teste&group=professores`, { headers });
    assert.deepEqual(await list.json(), [privateEntry]);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});