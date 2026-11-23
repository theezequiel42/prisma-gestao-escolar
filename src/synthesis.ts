import type { ReportSynthesis } from "./report.ts";

export interface SynthesisVersion {
  version: number;
  status: "rascunho" | "aprovada";
  content: ReportSynthesis;
  author: string;
  createdAt: string;
  reviewNote: string | null;
  generatedBy: "ia" | "humano";
}

export function createSynthesisVersion(
  content: ReportSynthesis,
  author: string,
  version = 1,
  createdAt = new Date().toISOString(),
  generatedBy: "ia" | "humano" = "humano",
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
    generatedBy,
  };
}

export function approveSynthesis(
  draft: SynthesisVersion,
  reviewNote = "",
): SynthesisVersion {
  const note = reviewNote.trim();
  return {
    ...draft,
    status: "aprovada",
    reviewNote: note.length > 0 ? note : null,
  };
}
