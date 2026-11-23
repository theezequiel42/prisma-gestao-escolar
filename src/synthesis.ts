import type { ReportSynthesis } from "./report.ts";

export interface SynthesisVersion {
  version: number;
  status: "rascunho" | "em_revisao" | "aprovada" | "devolvida";
  content: ReportSynthesis;
  author: string;
  createdAt: string;
  reviewNote: string | null;
}

export function createSynthesisVersion(
  content: ReportSynthesis,
  author: string,
  version = 1,
  createdAt = new Date().toISOString(),
): SynthesisVersion {
  const fields = Object.values(content).map((value) => value.trim());
  if (!author.trim() || fields.some((value) => value.length === 0)) {
    throw new Error("Síntese e responsável são obrigatórios.");
  }
  return {
    version,
    status: "rascunho",
    content: {
      perception: fields[0],
      strength: fields[1],
      attention: fields[2],
    },
    author: author.trim(),
    createdAt,
    reviewNote: null,
  };
}

export function reviewSynthesis(
  draft: SynthesisVersion,
  decision: "aprovar" | "devolver",
  reviewNote: string,
): SynthesisVersion {
  if (!reviewNote.trim()) {
    throw new Error("A revisão deve registrar uma observação.");
  }
  return {
    ...draft,
    status: decision === "aprovar" ? "aprovada" : "devolvida",
    reviewNote: reviewNote.trim(),
  };
}
