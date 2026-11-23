import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { unzipSync, zipSync } from "fflate";
import type ExcelJsTypes from "exceljs";
import type {
  AssessmentImport,
  ImportIssue,
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

export async function inspectWorkbook(sourceFile: string): Promise<AssessmentImport> {
  const workbook = new ExcelJS.Workbook();
  const source = await readFile(sourceFile);
  const sanitizedSource = Buffer.from(withoutCommentRelationships(source));
  await workbook.xlsx.load(
    sanitizedSource as unknown as Parameters<typeof workbook.xlsx.load>[0],
  );
  const sheets: SheetSummary[] = workbook.worksheets.map((sheet) => {
    return {
      name: sheet.name,
      rows: Math.max(0, sheet.rowCount - 1),
      columns: sheet.columnCount,
      kind: classifySheet(sheet.name, sheet.rowCount),
    };
  });
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
    sheets,
    issues,
    status: issues.some((entry) => entry.severity === "erro")
      ? "bloqueada"
      : "em_revisao",
  };
}
