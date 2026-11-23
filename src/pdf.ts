import PDFDocument from "pdfkit";
import type { FeedbackReport } from "./report.ts";

export async function renderFeedbackPdf(report: FeedbackReport): Promise<Buffer> {
  const document = new PDFDocument({ margin: 48, size: "A4" });
  const chunks: Buffer[] = [];
  document.on("data", (chunk: Buffer) => chunks.push(chunk));
  const complete = new Promise<Buffer>((resolve, reject) => {
    document.on("end", () => resolve(Buffer.concat(chunks)));
    document.on("error", reject);
  });

  document.fontSize(18).text("Devolutiva de avaliação de diretor", { align: "center" });
  document.moveDown();
  document.fontSize(11).text(`Diretor(a): ${report.director}`);
  document.text(`Ciclo: ${report.cycle ?? "não informado"}`);
  document.text(`Unidade: ${report.unit ?? "não informada"}`);
  document.text(`Situação: ${report.state}`);
  document.text(`Versão: ${report.version} | Emissão: ${report.issuedAt}`);
  document.moveDown();

  document.fontSize(14).text("Resultados por público");
  document.moveDown(0.5);
  for (const [group, summary] of Object.entries(report.groups)) {
    document.fontSize(11).text(group);
    document
      .fontSize(10)
      .text(`Submissões: ${summary.submissions}`)
      .text(
        `Respostas válidas: ${summary.overall.validCount} | Escala: ${summary.overall.scale.min} a ${summary.overall.scale.max}`,
      )
      .text(
        `Média: ${
          summary.overall.mean === null
            ? "indisponível por confidencialidade ou insuficiência de dados"
            : summary.overall.mean
        }`,
      );
    document.moveDown(0.7);
  }

  document.fontSize(14).text("Nota metodológica");
  document.fontSize(10);
  for (const note of report.methodology.notes) {
    document.text(`• ${note}`);
  }
  document.moveDown();
  document
    .fontSize(9)
    .text("Documento preliminar. A exportação não representa aprovação ou envio ao destinatário.");
  document.end();
  return complete;
}
