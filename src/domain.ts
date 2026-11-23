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

export type PublicationState =
  | "em_revisao"
  | "preliminar"
  | "aprovada"
  | "bloqueada";

export interface AssessmentRecord {
  director: string;
  group: RespondentGroup;
  answers: Record<string, unknown>;
  cycle?: string;
  unit?: string;
}

export interface PublicationCheck {
  state: PublicationState;
  blockers: string[];
  warnings: string[];
}

export interface IndicatorResult {
  validCount: number;
  mean: number | null;
  scale: { min: number; max: number };
  disclosed: boolean;
  disclosureThreshold: number;
  note: string | null;
}
