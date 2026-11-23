import { inspectWorkbook } from "./importer.ts";

const sourceFile = process.argv[2];
if (!sourceFile) {
  console.error("Uso: npm run inspect:base -- caminho/para/arquivo.xlsx");
  process.exitCode = 2;
} else {
  try {
    console.log(JSON.stringify(await inspectWorkbook(sourceFile), null, 2));
  } catch (error) {
    console.error(
      `Não foi possível ler a planilha: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  }
}
