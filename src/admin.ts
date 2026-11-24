import { createHash, timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";

export type RequestHandler = (request: IncomingMessage, response: ServerResponse) => void | Promise<void>;
export const adminPath = "/admin";

function digest(value: string | Buffer): Buffer {
  return createHash("sha256").update(value).digest();
}

export function protectAdmin(publicHandler: RequestHandler, admin?: { password: string; handler: RequestHandler }): RequestHandler {
  const expected = admin && admin.password.length >= 24 ? digest(`admin:${admin.password}`) : null;
  return (request, response) => {
    const url = new URL(request.url ?? "/", "http://localhost");
    if (url.pathname !== adminPath && !url.pathname.startsWith(`${adminPath}/`)) {
      return publicHandler(request, response);
    }
    response.setHeader("cache-control", "private, no-store");
    response.setHeader("x-content-type-options", "nosniff");
    response.setHeader("x-robots-tag", "noindex");
    if (!admin || !expected) {
      response.writeHead(404).end("Área administrativa indisponível.");
      return;
    }
    if (url.pathname === adminPath && (request.method === "GET" || request.method === "HEAD")) {
      response.writeHead(308, { location: `${adminPath}/${url.search}` }).end();
      return;
    }
    const header = request.headers.authorization ?? "";
    const parts = /^Basic ([A-Za-z0-9+/]+={0,2})$/i.exec(header);
    if (!parts || !timingSafeEqual(expected, digest(Buffer.from(parts[1], "base64")))) {
      response.writeHead(401, {
        "www-authenticate": 'Basic realm="Administracao de sinteses", charset="UTF-8"',
        "content-type": "text/plain; charset=utf-8",
      }).end("Acesso administrativo restrito.");
      return;
    }
    return admin.handler(request, response);
  };
}