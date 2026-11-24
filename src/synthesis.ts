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

const MAX_AUTHOR_LENGTH = 200;
const MAX_FIELD_LENGTH = 2000;
const MAX_NOTE_LENGTH = 1000;

function readBoundedString(value: unknown, label: string, maxLength: number): string {
  if (typeof value !== "string") {
    throw new Error(`${label} deve ser um texto válido.`);
  }
  const trimmed = value.trim();
  if (trimmed.length > maxLength) {
    throw new Error(`${label} excede o limite máximo de ${maxLength} caracteres.`);
  }
  return trimmed;
}

export function createSynthesisVersion(
  content: ReportSynthesis,
  author: string,
  version = 1,
  createdAt = new Date().toISOString(),
  generatedBy: "ia" | "humano" = "humano",
): SynthesisVersion {
  if (!content || typeof content !== "object") {
    throw new Error("Síntese e responsável são obrigatórios.");
  }
  const cleanAuthor = readBoundedString(author, "Responsável", MAX_AUTHOR_LENGTH);
  const perception = readBoundedString(content.perception, "Impressão geral", MAX_FIELD_LENGTH);
  const strength = readBoundedString(content.strength, "Ponto forte", MAX_FIELD_LENGTH);
  const attention = readBoundedString(content.attention, "Aspecto de atenção", MAX_FIELD_LENGTH);
  if (!cleanAuthor || !perception || !strength || !attention) {
    throw new Error("Síntese e responsável são obrigatórios.");
  }
  return {
    version,
    status: "rascunho",
    content: {
      perception,
      strength,
      attention,
    },
    author: cleanAuthor,
    createdAt,
    reviewNote: null,
    generatedBy,
  };
}

export function approveSynthesis(
  draft: SynthesisVersion,
  reviewNote = "",
): SynthesisVersion {
  const note = readBoundedString(reviewNote, "Observação da aprovação", MAX_NOTE_LENGTH);
  return {
    ...draft,
    status: "aprovada",
    reviewNote: note.length > 0 ? note : null,
  };
}
