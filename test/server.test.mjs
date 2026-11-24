import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { unzipSync } from "fflate";
import { createApp } from "../dist/app.js";
import { SynthesisStore } from "../dist/store.js";

async function startTestServer(extraRecords = []) {
  const dir = await mkdtemp(join(tmpdir(), "avaliacao-http-"));
  const store = new SynthesisStore(join(dir, "syntheses.json"));
  await store.load();
  const records = [
    {
      director: "Patrícia Faquin",
      group: "professores",
      answers: { "1. Parceria pedagógica": 5, "2. Diálogo no PPP": 4 },
    },
    {
      director: "Patrícia Faquin",
      group: "funcionarios",
      answers: { "1. Comunicação clara": 4.5 },
    },
    {
      director: "Patrícia Faquin",
      group: "pais_responsaveis",
      answers: { "1. Acolhimento às famílias": 5 },
    },
    ...extraRecords,
  ];
  const server = createApp({
    records,
    synthesisStore: store,
    sourceFile: "avaliacao_diretores_2026.xlsx",
    aiProvider: {
      async generate(evidence) {
        return {
          perception: `Percepção de ${evidence.group}.`,
          strength: `Força de ${evidence.group}.`,
          attention: `Atenção de ${evidence.group}.`,
        };
      },
    },
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  return {
    baseUrl,
    async close() {
      await new Promise((resolve) => server.close(resolve));
      await rm(dir, { recursive: true, force: true });
    },
  };
}

test("retorna cabeçalhos de segurança, 404 em rotas inexistentes e 405 em métodos inválidos", async () => {
  const app = await startTestServer();
  try {
    const home = await fetch(`${app.baseUrl}/`);
    assert.equal(home.status, 200);
    assert.equal(home.headers.get("x-content-type-options"), "nosniff");
    assert.equal(home.headers.get("x-frame-options"), "DENY");
    assert.equal(home.headers.get("referrer-policy"), "no-referrer");
    assert.match(home.headers.get("content-security-policy") ?? "", /frame-ancestors 'none'/);

    const notFound = await fetch(`${app.baseUrl}/favicon.ico`);
    assert.equal(notFound.status, 404);

    const apiNotFound = await fetch(`${app.baseUrl}/api/inexistente`);
    assert.equal(apiNotFound.status, 404);

    const wrongMethod = await fetch(`${app.baseUrl}/api/directors`, { method: "POST" });
    assert.equal(wrongMethod.status, 405);
  } finally {
    await app.close();
  }
});

test("protege rotas POST contra CSRF, Content-Type inválido, payload excessivo e dados inválidos", async () => {
  const app = await startTestServer();
  try {
    const badContentType = await fetch(`${app.baseUrl}/api/syntheses`, {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: JSON.stringify({ director: "Patrícia Faquin", group: "professores" }),
    });
    assert.equal(badContentType.status, 415);

    const crossOrigin = await fetch(`${app.baseUrl}/api/syntheses`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "https://site-externo.exemplo",
      },
      body: JSON.stringify({ director: "Patrícia Faquin", group: "professores" }),
    });
    assert.equal(crossOrigin.status, 403);

    const crossSiteFetch = await fetch(`${app.baseUrl}/api/syntheses`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "sec-fetch-site": "cross-site",
      },
      body: JSON.stringify({ director: "Patrícia Faquin", group: "professores" }),
    });
    assert.equal(crossSiteFetch.status, 403);

    const oversized = await fetch(`${app.baseUrl}/api/syntheses`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        director: "Patrícia Faquin",
        group: "professores",
        author: "Equipe",
        content: { perception: "a".repeat(70_000), strength: "b", attention: "c" },
      }),
    });
    assert.equal(oversized.status, 413);

    const unknownDirector = await fetch(`${app.baseUrl}/api/syntheses`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        director: "Inexistente",
        group: "professores",
        author: "Equipe",
        content: { perception: "P", strength: "F", attention: "A" },
      }),
    });
    assert.equal(unknownDirector.status, 400);
  } finally {
    await app.close();
  }
});

test("escapa nomes com tags script no HTML sem interpolação insegura em script inline", async () => {
  const maliciousName = '</script><img src=x onerror=alert(1)>';
  const app = await startTestServer([
    {
      director: maliciousName,
      group: "professores",
      answers: { q1: 4 },
    },
  ]);
  try {
    const res = await fetch(`${app.baseUrl}/?director=${encodeURIComponent(maliciousName)}`);
    assert.equal(res.status, 200);
    const html = await res.text();
    assert.equal(html.includes(maliciousName), false);
    assert.match(html, /&lt;\/script&gt;/);
  } finally {
    await app.close();
  }
});

test("gera sínteses para os 3 públicos, aprova e exporta PDF individual e ZIP em lote", async () => {
  const app = await startTestServer();
  try {
    const genRes = await fetch(`${app.baseUrl}/api/syntheses/generate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ director: "Patrícia Faquin", author: "IA" }),
    });
    assert.equal(genRes.status, 201);
    const created = await genRes.json();
    assert.equal(Array.isArray(created), true);
    assert.equal(created.length, 3);

    const approveRes = await fetch(`${app.baseUrl}/api/syntheses/approve`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        director: "Patrícia Faquin",
        group: "professores",
        version: 1,
        note: "Tudo certo",
      }),
    });
    assert.equal(approveRes.status, 200);
    const approved = await approveRes.json();
    assert.equal(approved.status, "aprovada");

    const pdfRes = await fetch(
      `${app.baseUrl}/report.pdf?director=${encodeURIComponent("Patrícia Faquin")}`,
    );
    assert.equal(pdfRes.status, 200);
    assert.equal(pdfRes.headers.get("content-type"), "application/pdf");
    const disposition = pdfRes.headers.get("content-disposition") ?? "";
    assert.match(disposition, /filename="devolutiva-patricia-faquin\.pdf"/);
    assert.match(disposition, /filename\*=UTF-8''/);
    const pdfBuf = Buffer.from(await pdfRes.arrayBuffer());
    assert.equal(pdfBuf.subarray(0, 5).toString(), "%PDF-");

    const zipRes = await fetch(`${app.baseUrl}/reports.zip`);
    assert.equal(zipRes.status, 200);
    assert.equal(zipRes.headers.get("content-type"), "application/zip");
    const zipBytes = new Uint8Array(await zipRes.arrayBuffer());
    const entries = unzipSync(zipBytes);
    assert.deepEqual(Object.keys(entries), ["devolutiva-patricia-faquin.pdf"]);
    assert.equal(Buffer.from(entries["devolutiva-patricia-faquin.pdf"]).subarray(0, 5).toString(), "%PDF-");
  } finally {
    await app.close();
  }
});
