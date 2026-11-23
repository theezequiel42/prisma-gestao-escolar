import type { ReportSynthesis } from "./report.ts";

export interface AiEvidence {
  director: string;
  group: string;
  submissions: number;
  validCount: number;
  mean: number | null;
  scale: { min: number; max: number };
  disclosureThreshold: number;
  limitation: string | null;
}

export interface AiProvider {
  generate(evidence: AiEvidence): Promise<ReportSynthesis>;
}

function parseJsonContent(content: string): ReportSynthesis {
  const cleaned = content
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  const parsed = JSON.parse(cleaned) as Partial<ReportSynthesis>;
  const fields = {
    perception: parsed.perception?.trim() ?? "",
    strength: parsed.strength?.trim() ?? "",
    attention: parsed.attention?.trim() ?? "",
  };
  if (Object.values(fields).some((value) => value.length === 0)) {
    throw new Error("A IA não retornou os três campos obrigatórios da síntese.");
  }
  return fields;
}

export function createOpenAiCompatibleProvider(
  environment: NodeJS.ProcessEnv = process.env,
  fetchImpl: typeof fetch = fetch,
): AiProvider {
  const provider = environment.AI_PROVIDER ?? "openai";
  const apiKey =
    provider === "gemini"
      ? environment.GEMINI_API_KEY ?? environment.GOOGLE_API_KEY ?? environment.AI_API_KEY
      : environment.OPENAI_API_KEY ?? environment.AI_API_KEY;
  if (!apiKey) {
    if (provider === "gemini") {
      throw new Error(
        "IA não configurada: defina GEMINI_API_KEY ou GOOGLE_API_KEY antes de gerar sínteses.",
      );
    }
    throw new Error(
      "IA não configurada: defina OPENAI_API_KEY ou AI_API_KEY antes de gerar sínteses.",
    );
  }

  const model =
    environment.AI_MODEL ??
    environment.OPENAI_MODEL ??
    (provider === "gemini" ? "gemini-2.5-flash" : "gpt-4o-mini");
  let url =
    provider === "gemini"
      ? `${environment.GEMINI_BASE_URL ?? "https://generativelanguage.googleapis.com/v1beta/openai"}/chat/completions`
      : `${environment.OPENAI_BASE_URL ?? "https://api.openai.com/v1"}/chat/completions`;
  const headers: Record<string, string> = {
    "content-type": "application/json",
    authorization: `Bearer ${apiKey}`,
  };

  if (provider === "azure") {
    const endpoint = environment.AI_ENDPOINT;
    const deployment = environment.AI_DEPLOYMENT;
    if (!endpoint || !deployment) {
      throw new Error("Azure OpenAI exige AI_ENDPOINT e AI_DEPLOYMENT.");
    }
    url =
      `${endpoint.replace(/\/$/, "")}/openai/deployments/${deployment}` +
      `/chat/completions?api-version=${environment.AI_API_VERSION ?? "2024-10-21"}`;
    headers["api-key"] = apiKey;
    delete headers.authorization;
  }

  return {
    async generate(evidence: AiEvidence): Promise<ReportSynthesis> {
      const prompt = `Você é um assistente de análise educacional institucional.
Gere uma síntese breve e respeitosa em português brasileiro a partir exclusivamente dos dados abaixo.
Não atribua causas, intenções, culpa ou competência pessoal.
Não use superlativos, diagnósticos ou recomendações apresentadas como fatos.
Cada campo deve conter uma única frase curta.
Responda somente em JSON válido com: perception, strength, attention.

Diretor: ${evidence.director}
Público: ${evidence.group}
Submissões: ${evidence.submissions}
Respostas válidas: ${evidence.validCount}
Escala: ${evidence.scale.min} a ${evidence.scale.max}
Média: ${evidence.mean === null ? "indisponível" : evidence.mean}
Limite mínimo de divulgação: ${evidence.disclosureThreshold}
Limitação: ${evidence.limitation ?? "nenhuma"}
`;
      const response = await fetchImpl(url, {
        method: "POST",
        headers,
        body: JSON.stringify({
          model,
          temperature: 0.2,
          messages: [
            { role: "system", content: "Produza textos institucionais fundamentados nos dados." },
            { role: "user", content: prompt },
          ],
        }),
      });
      if (!response.ok) {
        throw new Error(
          `Falha na geração por IA (${response.status}): ${await response.text()}`,
        );
      }
      const payload = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = payload.choices?.[0]?.message?.content;
      if (!content) throw new Error("A IA não retornou conteúdo utilizável.");
      return parseJsonContent(content);
    },
  };
}

export async function generateSynthesis(
  evidence: AiEvidence,
  provider?: AiProvider,
): Promise<ReportSynthesis> {
  const selected = provider ?? createOpenAiCompatibleProvider();
  return selected.generate(evidence);
}
