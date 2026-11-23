export const respondentGroups = [
  "professores",
  "funcionarios",
  "pais_responsaveis",
] as const;

export type RespondentGroup = (typeof respondentGroups)[number];

export type ImportSeverity = "erro" | "alerta";

export interface ImportIssue {
  code: string;
  severity: ImportSeverity;
  message: string;
  sheet?: string;
  column?: string;
}

export interface SheetSummary {
  name: string;
  rows: number;
  columns: number;
  kind: "respostas" | "auxiliar" | "desconhecida";
}

export interface AssessmentImport {
  sourceFile: string;
  responseSheet: string | null;
  responseCount: number;
  directorCount: number;
  groups: Record<string, number>;
  sheets: SheetSummary[];
  issues: ImportIssue[];
  status: "em_revisao" | "bloqueada";
}
