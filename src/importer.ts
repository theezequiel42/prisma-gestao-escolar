import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { unzipSync, zipSync } from "fflate";
import type ExcelJsTypes from "exceljs";
import type {
  AssessmentImport,
  AssessmentRecord,
  ImportIssue,
  QuestionMapEntry,
  RespondentGroup,
  SheetSummary,
} from "./domain.ts";

const require = createRequire(import.meta.url);
const ExcelJS = require("exceljs") as typeof ExcelJsTypes;

const responseSheetHints = ["resposta", "response", "dados", "base"];
const directorHeaders = [
  "Diretor(a) Avaliado(a)",
  "Diretor Avaliado",
  "Diretor(a) avaliado(a)",
];
const groupHints: Record<string, string[]> = {
  professores: ["professor", "docente"],
  funcionarios: ["funcion", "servidor", "equipe"],
  pais_responsaveis: ["pai", "respons", "famil", "comunidade"],
};

function normalized(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLowerCase();
}

function classifySheet(name: string, rows: number): SheetSummary["kind"] {
  const value = normalized(name);
  if (responseSheetHints.some((hint) => value.includes(hint)) && rows > 1) {
    return "respostas";
  }
  if (value.includes("mapa") || value.includes("origem") || value.includes("aux")) {
    return "auxiliar";
  }
  return "desconhecida";
}

function findHeader(headers: string[], candidates: string[]): string | undefined {
  const candidateValues = candidates.map(normalized);
  return headers.find((header) => candidateValues.includes(normalized(header)));
}

function inferGroup(header: string): string | undefined {
  const value = normalized(header);
  return Object.entries(groupHints).find(([, hints]) =>
    hints.some((hint) => value.includes(hint)),
  )?.[0];
}

function issue(
  code: string,
  severity: ImportIssue["severity"],
  message: string,
  sheet?: string,
  column?: string,
): ImportIssue {
  return { code, severity, message, sheet, column };
}

function readQuestionMap(workbook: InstanceType<typeof ExcelJS.Workbook>): QuestionMapEntry[] {
  const sheet = workbook.worksheets.find((candidate) =>
    normalized(candidate.name).includes("mapa"),
  );
  if (!sheet) return [];
  const entries: QuestionMapEntry[] = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const value = (column: number) => row.getCell(column).value;
    const header = String(value(5) ?? "").trim();
    if (!header) return;
    const numeric = (column: number): number | null => {
      const current = Number(value(column));
      return Number.isFinite(current) ? current : null;
    };
    entries.push({
      lot: String(value(1) ?? "").trim(),
      sourceColumn: numeric(2),
      unifiedColumn: numeric(3),
      block: String(value(4) ?? "").trim(),
      header: String(value(5) ?? "").trim(),
    });
  });
  return entries;
}

function withoutCommentRelationships(source: Uint8Array): Uint8Array {
  const files = unzipSync(source);
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  for (const [name, content] of Object.entries(files)) {
    if (!name.endsWith(".rels") && !name.endsWith(".xml")) {
      continue;
    }
    const xml = decoder.decode(content);
    if (name.endsWith(".rels")) {
      files[name] = encoder.encode(
        xml.replace(
          /<Relationship\b[^>]*(?:comments|vmlDrawing)[^>]*\/>/gi,
          "",
        ),
      );
    } else if (name.includes("/worksheets/") && !name.includes("_rels/")) {
      files[name] = encoder.encode(xml.replace(/<legacyDrawing\b[^>]*\/>/gi, ""));
    }
  }
  return zipSync(files);
}

async function openWorkbook(sourceFile: string) {
  const workbook = new ExcelJS.Workbook();
  const source = await readFile(sourceFile);
  const sanitizedSource = Buffer.from(withoutCommentRelationships(source));
  await workbook.xlsx.load(
    sanitizedSource as unknown as Parameters<typeof workbook.xlsx.load>[0],
  );
  return workbook;
}

export async function inspectWorkbook(sourceFile: string): Promise<AssessmentImport> {
  const workbook = await openWorkbook(sourceFile);
  const sheets: SheetSummary[] = workbook.worksheets.map((sheet) => {
    return {
      name: sheet.name,
      rows: Math.max(0, sheet.rowCount - 1),
      columns: sheet.columnCount,
      kind: classifySheet(sheet.name, sheet.rowCount),
    };
  });
  const questionMap = readQuestionMap(workbook);
  const issues: ImportIssue[] = [];
  const responseCandidates = sheets.filter((sheet) => sheet.kind === "respostas");
  if (responseCandidates.length !== 1) {
    issues.push(
      issue(
        "ABA_RESPOSTAS_AMBIGUA",
        "erro",
        responseCandidates.length === 0
          ? "Nenhuma aba de respostas foi reconhecida."
          : "Mais de uma aba de respostas foi reconhecida; selecione explicitamente a origem.",
      ),
    );
  }

  const responseSheet = responseCandidates[0];
  if (!responseSheet) {
    return {
      sourceFile,
      responseSheet: null,
      responseCount: 0,
      directorCount: 0,
      groups: {},
      questionMap,
      sheets,
      issues,
      status: "bloqueada",
    };
  }

  const worksheet = workbook.getWorksheet(responseSheet.name);
  if (!worksheet) {
    throw new Error(`A aba reconhecida não está disponível: ${responseSheet.name}`);
  }
  const headerRow = worksheet.getRow(1);
  const headers: string[] = Array.from(
    { length: worksheet.columnCount },
    (_, index) => String(headerRow.getCell(index + 1).value ?? `Coluna ${index + 1}`),
  );
  const rows: Array<ReturnType<typeof worksheet.getRow>> = [];
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber > 1) {
      rows.push(row);
    }
  });
  const directorHeader = findHeader(headers, directorHeaders);
  if (!directorHeader) {
    issues.push(
      issue(
        "DIRETOR_AUSENTE",
        "erro",
        "A coluna de identificação do diretor avaliado não foi encontrada.",
        responseSheet.name,
      ),
    );
  }

  const directors = new Set(
    rows
      .map((row) => {
        const index = directorHeader ? headers.indexOf(directorHeader) + 1 : -1;
        return String(index > 0 ? row.getCell(index).value ?? "" : "").trim();
      })
      .filter(Boolean),
  );
  const groups = Object.fromEntries(
    headers
      .map((header) => [header, inferGroup(header)] as const)
      .filter((entry): entry is readonly [string, string] => Boolean(entry[1]))
      .reduce<Map<string, number>>((counts, [, group]) => {
        counts.set(group, (counts.get(group) ?? 0) + 1);
        return counts;
      }, new Map()),
  );
  if (directors.size === 0) {
    issues.push(
      issue(
        "DIRETORES_NAO_RECONHECIDOS",
        "erro",
        "Nenhum diretor avaliado foi identificado nos registros.",
        responseSheet.name,
      ),
    );
  }
  if (rows.length === 0) {
    issues.push(issue("SEM_RESPOSTAS", "erro", "A aba reconhecida não possui respostas."));
  }
  return {
    sourceFile,
    responseSheet: responseSheet.name,
    responseCount: rows.length,
    directorCount: directors.size,
    groups,
    questionMap,
    sheets,
    issues,
    status: issues.some((entry) => entry.severity === "erro")
      ? "bloqueada"
      : "em_revisao",
  };
}

export async function readAssessmentRecords(
  sourceFile: string,
): Promise<AssessmentRecord[]> {
  const workbook = await openWorkbook(sourceFile);
  const responseSheet = workbook.worksheets.find(
    (sheet) => classifySheet(sheet.name, sheet.rowCount) === "respostas",
  );
  if (!responseSheet) {
    throw new Error("Nenhuma aba de respostas foi reconhecida.");
  }
  const headers: string[] = Array.from(
    { length: responseSheet.columnCount },
    (_, index) =>
      String(responseSheet.getRow(1).getCell(index + 1).value ?? `Coluna ${index + 1}`),
  );
  const directorHeader = findHeader(headers, directorHeaders);
  if (!directorHeader) {
    throw new Error("A coluna de identificação do diretor não foi encontrada.");
  }
  const directorIndex = headers.indexOf(directorHeader) + 1;
  const groupColumns = new Map<RespondentGroup, number[]>();
  for (const [index, header] of headers.entries()) {
    const group = inferGroup(header) as RespondentGroup | undefined;
    if (group) {
      groupColumns.set(group, [...(groupColumns.get(group) ?? []), index + 1]);
    }
  }
  const records: AssessmentRecord[] = [];
  responseSheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const director = String(row.getCell(directorIndex).value ?? "").trim();
    if (!director) return;
    for (const [group, columns] of groupColumns) {
      const answers = Object.fromEntries(
        columns.map((column) => [headers[column - 1], row.getCell(column).value]),
      );
      records.push({ director, group, answers });
    }
  });
  return records;
}
