import type { IncomingMessage, ServerResponse } from "node:http";
import { join } from "node:path";
import { adminPath, protectAdmin, type RequestHandler } from "./admin.ts";
import { createOpenAiCompatibleProvider } from "./ai.ts";
import { createRequestHandler } from "./app.ts";
import { readAssessmentRecords } from "./importer.ts";
import { PostgresSynthesisStore } from "./postgres-store.ts";

const workbook = "avaliacao_diretores_2026_unificada_sem_nome_cpf.xlsx";
let handler: Promise<RequestHandler> | undefined;

async function initialize(): Promise<RequestHandler> {
  const records = await readAssessmentRecords(join(process.cwd(), workbook));
  const options = { records, sourceFile: workbook };
  const publicHandler = createRequestHandler(options);
  const { ADMIN_PASSWORD: password, DATABASE_URL: databaseUrl } = process.env;
  if (!password || password.length < 24 || !databaseUrl) {
    if (process.env.VERCEL_ENV === "production") {
      console.warn("[vercel] Área administrativa indisponível:", {
        passwordConfigured: Boolean(password),
        passwordMeetsMinimum: (password?.length ?? 0) >= 24,
        databaseConfigured: Boolean(databaseUrl),
      });
    }
    return protectAdmin(publicHandler);
  }

  let privateHandler: RequestHandler | undefined;
  return protectAdmin(publicHandler, {
    password,
    async handler(request, response) {
      privateHandler ??= createRequestHandler({
        ...options,
        basePath: adminPath,
        synthesisStore: new PostgresSynthesisStore(databaseUrl),
        aiProvider: {
          generate(evidence) {
            const provider = createOpenAiCompatibleProvider({ ...process.env, AI_PROVIDER: "gemini" });
            return provider.generate({ ...evidence, director: "Direção avaliada" });
          },
        },
      });
      await privateHandler(request, response);
    },
  });
}

export default async function handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
  try {
    handler ??= initialize().catch((error: unknown) => {
      handler = undefined;
      throw error;
    });
    await (await handler)(request, response);
  } catch (error) {
    console.error("[vercel] Falha ao atender requisição:", error instanceof Error ? error.name : "UnknownError");
    if (response.headersSent) response.end();
    else response.writeHead(500, { "content-type": "text/plain; charset=utf-8" }).end("Falha interna.");
  }
}