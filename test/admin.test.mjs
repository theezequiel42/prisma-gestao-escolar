import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { protectAdmin } from "../dist/admin.js";

const password = "senha-de-teste-nao-utilizada-publicamente";

test("separa rotas públicas de rotas administrativas e protege todas as rotas administrativas", async () => {
  const respond = (text) => (req, res) => res.end(`${text}:${req.url}`);
  const server = createServer(protectAdmin(respond("público"), { password, handler: respond("privado") }));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  try {
    const headers = { authorization: `Basic ${Buffer.from(`admin:${password}`).toString("base64")}` };
    assert.equal(await (await fetch(url, { headers })).text(), "público:/");
    const anonymous = await fetch(`${url}/admin/api/syntheses`, { method: "POST" });
    assert.equal(anonymous.status, 401);
    assert.match(anonymous.headers.get("www-authenticate"), /^Basic /);
    assert.match(anonymous.headers.get("cache-control"), /no-store/);
    assert.equal((await fetch(`${url}/admin/`, { headers: { authorization: "Basic Zm9vOmJhcg==" } })).status, 401);
    const redirect = await fetch(`${url}/admin`, { redirect: "manual" });
    assert.equal(redirect.headers.get("location"), "/admin/");
    const admin = await fetch(`${url}/admin/api/syntheses?group=professores`, { headers });
    assert.equal(await admin.text(), "privado:/admin/api/syntheses?group=professores");
    assert.match(admin.headers.get("cache-control"), /no-store/);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});