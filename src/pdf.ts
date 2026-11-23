import PDFDocument from "pdfkit";
import type { GroupDashboard, QuestionIndicator } from "./dashboard.ts";
import type { FeedbackReport, ReportSynthesis } from "./report.ts";

interface GroupTheme {
  key: string;
  label: string;
  bg: string;
  cardTint: string;
  border: string;
  dark: string;
  accent: string;
}

const groupThemes: Record<string, GroupTheme> = {
  professores: {
    key: "professores",
    label: "Professores",
    bg: "#EBF4FC",
    cardTint: "#F7FBFF",
    border: "#7AB3E6",
    dark: "#0B3E70",
    accent: "#176EC2",
  },
  funcionarios: {
    key: "funcionarios",
    label: "Funcionários",
    bg: "#EDF8EE",
    cardTint: "#F6FCF7",
    border: "#7BC188",
    dark: "#195B2B",
    accent: "#2D8A44",
  },
  pais_responsaveis: {
    key: "pais_responsaveis",
    label: "Pais / Responsáveis",
    bg: "#FFF3E6",
    cardTint: "#FFFBF6",
    border: "#F2AD66",
    dark: "#B93C00",
    accent: "#EE7402",
  },
};

function formatDecimal(value: number): string {
  return value.toFixed(2).replace(".", ",");
}

function formatDateBr(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function cleanQuestionText(text: string, maxLength = 105): string {
  const cleaned = text
    .replace(/^\s*\d+\s*(?:[-.)]\s*|\s+)/, "")
    .replace(/^["“]+|["”]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (cleaned.length <= maxLength) return cleaned;
  const slice = cleaned.slice(0, maxLength - 1);
  const lastSpace = slice.lastIndexOf(" ");
  const cut = lastSpace > maxLength * 0.6 ? slice.slice(0, lastSpace) : slice;
  return `${cut.trimEnd()}...`;
}

function pickHighlightQuestions(summary: GroupDashboard): {
  highest: QuestionIndicator | null;
  lowest: QuestionIndicator | null;
} {
  const items = summary.questions ?? [];
  if (items.length === 0) return { highest: null, lowest: null };
  const byHigh = [...items].sort((a, b) => b.mean - a.mean || b.validCount - a.validCount);
  const byLow = [...items].sort((a, b) => a.mean - b.mean || b.validCount - a.validCount);
  const highest = byHigh[0] ?? null;
  const lowestCandidate = byLow[0] ?? null;
  const lowest =
    lowestCandidate && highest && lowestCandidate.question === highest.question
      ? null
      : lowestCandidate;
  return { highest, lowest };
}

function starPath(
  doc: PDFKit.PDFDocument,
  cx: number,
  cy: number,
  outerR: number,
  innerR: number,
): void {
  const points = 5;
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outerR : innerR;
    const angle = (Math.PI / points) * i - Math.PI / 2;
    const x = cx + Math.cos(angle) * r;
    const y = cy + Math.sin(angle) * r;
    if (i === 0) doc.moveTo(x, y);
    else doc.lineTo(x, y);
  }
  doc.closePath();
}

function drawStars(
  doc: PDFKit.PDFDocument,
  centerX: number,
  cy: number,
  rating: number | null,
  maxScale = 5,
): void {
  const count = Math.max(1, Math.round(maxScale));
  const outerR = 8.2;
  const innerR = 3.7;
  const spacing = 19.5;
  const startX = centerX - ((count - 1) * spacing) / 2;
  const value = rating === null ? 0 : Math.max(0, Math.min(count, rating));

  for (let i = 0; i < count; i++) {
    const cx = startX + i * spacing;
    const fillRatio = Math.max(0, Math.min(1, value - i));

    doc.save();
    starPath(doc, cx, cy, outerR, innerR);
    doc.fillColor("#FFFFFF").fill();
    doc.restore();

    if (fillRatio > 0) {
      doc.save();
      starPath(doc, cx, cy, outerR, innerR);
      doc.clip();
      doc
        .rect(cx - outerR, cy - outerR, outerR * 2 * fillRatio, outerR * 2)
        .fillColor("#F5B400")
        .fill();
      doc.restore();
    }

    doc.save();
    starPath(doc, cx, cy, outerR, innerR);
    doc.lineWidth(1.1).strokeColor("#E09F00").stroke();
    doc.restore();
  }
}

function drawHeaderEmblem(doc: PDFKit.PDFDocument, x: number, y: number): void {
  doc.save();
  // Soft white backdrop behind emblem for contrast
  doc.circle(x + 36, y + 32, 33).fillColor("#FFFFFF").fill();

  // Open book pages (blue curves)
  doc
    .moveTo(x + 12, y + 48)
    .quadraticCurveTo(x + 24, y + 38, x + 36, y + 49)
    .quadraticCurveTo(x + 48, y + 38, x + 60, y + 48)
    .lineTo(x + 56, y + 54)
    .quadraticCurveTo(x + 46, y + 45, x + 36, y + 55)
    .quadraticCurveTo(x + 26, y + 45, x + 16, y + 54)
    .closePath()
    .fillColor("#176EC2")
    .fill();

  // Stylized figures above the book (blue, gold, green)
  // Left figure (blue)
  doc.circle(x + 23, y + 23, 4.2).fillColor("#176EC2").fill();
  doc
    .moveTo(x + 17, y + 31)
    .quadraticCurveTo(x + 23, y + 27, x + 29, y + 34)
    .lineTo(x + 26, y + 42)
    .lineTo(x + 20, y + 40)
    .closePath()
    .fillColor("#176EC2")
    .fill();

  // Center figure (gold)
  doc.circle(x + 36, y + 17, 4.8).fillColor("#F5B400").fill();
  doc
    .moveTo(x + 28, y + 25)
    .quadraticCurveTo(x + 36, y + 22, x + 44, y + 25)
    .lineTo(x + 40, y + 42)
    .lineTo(x + 32, y + 42)
    .closePath()
    .fillColor("#F5B400")
    .fill();

  // Right figure (green)
  doc.circle(x + 49, y + 23, 4.2).fillColor("#2D8A44").fill();
  doc
    .moveTo(x + 43, y + 34)
    .quadraticCurveTo(x + 49, y + 27, x + 55, y + 31)
    .lineTo(x + 52, y + 40)
    .lineTo(x + 46, y + 42)
    .closePath()
    .fillColor("#2D8A44")
    .fill();

  doc.restore();
}

function drawGroupIcon(
  doc: PDFKit.PDFDocument,
  groupKey: string,
  cx: number,
  cy: number,
  radius: number,
  circleColor: string,
  drawCircle = true,
): void {
  doc.save();
  if (drawCircle) {
    doc.circle(cx, cy, radius).fillColor(circleColor).fill();
  }
  const s = radius / 24;
  doc.fillColor("#FFFFFF").strokeColor("#FFFFFF");

  if (groupKey === "professores") {
    // Graduation cap (capelo)
    doc
      .moveTo(cx, cy - 10 * s)
      .lineTo(cx + 15 * s, cy - 3 * s)
      .lineTo(cx, cy + 4 * s)
      .lineTo(cx - 15 * s, cy - 3 * s)
      .closePath()
      .fill();
    doc
      .moveTo(cx - 9 * s, cy + 1 * s)
      .lineTo(cx - 9 * s, cy + 8 * s)
      .quadraticCurveTo(cx, cy + 13 * s, cx + 9 * s, cy + 8 * s)
      .lineTo(cx + 9 * s, cy + 1 * s)
      .lineTo(cx, cy + 5.5 * s)
      .closePath()
      .fill();
    doc
      .lineWidth(1.5 * s)
      .moveTo(cx + 12 * s, cy - 1 * s)
      .lineTo(cx + 12 * s, cy + 9 * s)
      .stroke();
    doc.circle(cx + 12 * s, cy + 10 * s, 1.8 * s).fill();
  } else if (groupKey === "funcionarios") {
    // Three people silhouettes
    doc.circle(cx, cy - 6 * s, 4.5 * s).fill();
    doc
      .moveTo(cx - 7.5 * s, cy + 10 * s)
      .quadraticCurveTo(cx - 7.5 * s, cy + 1 * s, cx, cy + 1 * s)
      .quadraticCurveTo(cx + 7.5 * s, cy + 1 * s, cx + 7.5 * s, cy + 10 * s)
      .closePath()
      .fill();

    for (const dir of [-1, 1]) {
      const ox = cx + dir * 10.5 * s;
      doc.circle(ox, cy - 3.5 * s, 3.3 * s).fill();
      doc
        .moveTo(ox - 5 * s, cy + 9 * s)
        .quadraticCurveTo(ox - 5 * s, cy + 2.5 * s, ox, cy + 2.5 * s)
        .quadraticCurveTo(ox + 5 * s, cy + 2.5 * s, ox + 5 * s, cy + 9 * s)
        .closePath()
        .fill();
    }
  } else {
    // House with family silhouettes
    doc
      .moveTo(cx, cy - 12 * s)
      .lineTo(cx + 14 * s, cy - 1 * s)
      .lineTo(cx + 10.5 * s, cy - 1 * s)
      .lineTo(cx + 10.5 * s, cy + 11 * s)
      .lineTo(cx - 10.5 * s, cy + 11 * s)
      .lineTo(cx - 10.5 * s, cy - 1 * s)
      .lineTo(cx - 14 * s, cy - 1 * s)
      .closePath()
      .fill();
    // Cutout family inside house in circleColor
    doc.fillColor(circleColor);
    doc.circle(cx - 4.2 * s, cy + 1 * s, 2.3 * s).fill();
    doc.circle(cx + 4.2 * s, cy + 1 * s, 2.3 * s).fill();
    doc.circle(cx, cy + 3 * s, 1.8 * s).fill();
    doc.roundedRect(cx - 7 * s, cy + 4.5 * s, 5.5 * s, 6.5 * s, 2 * s).fill();
    doc.roundedRect(cx + 1.5 * s, cy + 4.5 * s, 5.5 * s, 6.5 * s, 2 * s).fill();
    doc.roundedRect(cx - 2.2 * s, cy + 5.8 * s, 4.4 * s, 5.2 * s, 1.5 * s).fill();
  }
  doc.restore();
}

function drawBadgeIcon(
  doc: PDFKit.PDFDocument,
  kind: "info" | "check" | "alert",
  cx: number,
  cy: number,
  r = 7.5,
): void {
  doc.save();
  const color = kind === "check" ? "#2E8B41" : kind === "alert" ? "#EE7402" : "#176EC2";
  doc.circle(cx, cy, r).fillColor(color).fill();

  if (kind === "check") {
    doc
      .lineWidth(1.9)
      .lineCap("round")
      .lineJoin("round")
      .strokeColor("#FFFFFF")
      .moveTo(cx - 3.6, cy + 0.3)
      .lineTo(cx - 1.0, cy + 3.0)
      .lineTo(cx + 4.0, cy - 2.8)
      .stroke();
  } else if (kind === "alert") {
    doc
      .lineWidth(2)
      .lineCap("round")
      .strokeColor("#FFFFFF")
      .moveTo(cx, cy - 3.8)
      .lineTo(cx, cy + 1.0)
      .stroke();
    doc.circle(cx, cy + 3.6, 1.1).fillColor("#FFFFFF").fill();
  } else {
    doc.circle(cx, cy - 3.3, 1.15).fillColor("#FFFFFF").fill();
    doc
      .lineWidth(2)
      .lineCap("round")
      .strokeColor("#FFFFFF")
      .moveTo(cx, cy - 0.8)
      .lineTo(cx, cy + 3.8)
      .stroke();
  }
  doc.restore();
}

function drawSectionBlock(
  doc: PDFKit.PDFDocument,
  kind: "info" | "check" | "alert",
  title: string,
  titleColor: string,
  body: string,
  subline: string | null,
  x: number,
  y: number,
  width: number,
  maxBottomY: number,
): number {
  if (y + 24 > maxBottomY) return y;
  drawBadgeIcon(doc, kind, x + 8, y + 8, 7.2);

  const textX = x + 21;
  const textW = width - 21;

  doc.font("Helvetica-Bold").fontSize(8.8).fillColor(titleColor);
  doc.text(title, textX, y + 2, { width: textW, lineBreak: false });

  let cursorY = y + 14.5;
  const availableBodyH = Math.max(12, maxBottomY - cursorY - (subline ? 20 : 2));
  doc.font("Helvetica").fontSize(8.3).fillColor("#1F2D3D");
  const measuredBodyH = doc.heightOfString(body, { width: textW, lineGap: 1.2 });
  const usedBodyH = Math.min(measuredBodyH, availableBodyH);
  doc.text(body, textX, cursorY, {
    width: textW,
    height: availableBodyH,
    lineGap: 1.2,
    ellipsis: true,
  });
  cursorY += usedBodyH + 2;

  if (subline && cursorY + 11 <= maxBottomY) {
    const availSubH = Math.max(10, maxBottomY - cursorY);
    doc.font("Helvetica-Oblique").fontSize(7.4).fillColor("#4B5B6B");
    const measuredSubH = doc.heightOfString(subline, { width: textW, lineGap: 0.8 });
    const usedSubH = Math.min(measuredSubH, availSubH);
    doc.text(subline, textX, cursorY, {
      width: textW,
      height: availSubH,
      lineGap: 0.8,
      ellipsis: true,
    });
    cursorY += usedSubH + 2;
  }

  return cursorY + 5;
}

export async function renderFeedbackPdf(report: FeedbackReport): Promise<Buffer> {
  const doc = new PDFDocument({
    size: "A4",
    layout: "landscape",
    margin: 0,
    info: {
      Title: `Avaliação da Gestão Escolar — ${report.director}`,
      Author: "Secretaria Municipal de Educação",
    },
  });

  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const complete = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  const pageW = doc.page.width; // 841.89
  const pageH = doc.page.height; // 595.28
  const marginX = 24;
  const contentW = pageW - marginX * 2;

  // Clean white page background
  doc.rect(0, 0, pageW, pageH).fillColor("#FFFFFF").fill();

  // --- 1. HEADER BANNER ---
  // Secondary medium-blue & gold decorative waves
  doc.save();
  doc
    .moveTo(0, 0)
    .lineTo(pageW, 0)
    .lineTo(pageW, 82)
    .bezierCurveTo(pageW * 0.78, 96, pageW * 0.62, 74, pageW * 0.45, 82)
    .bezierCurveTo(pageW * 0.25, 92, pageW * 0.12, 86, 0, 74)
    .closePath()
    .fillColor("#1A6BC4")
    .fill();

  doc
    .moveTo(pageW * 0.52, 76)
    .bezierCurveTo(pageW * 0.68, 66, pageW * 0.85, 88, pageW, 68)
    .lineTo(pageW, 79)
    .bezierCurveTo(pageW * 0.85, 94, pageW * 0.68, 76, pageW * 0.52, 83)
    .closePath()
    .fillColor("#F5B400")
    .fill();

  // Main deep navy curved header
  doc
    .moveTo(0, 0)
    .lineTo(pageW, 0)
    .lineTo(pageW, 66)
    .bezierCurveTo(pageW * 0.82, 84, pageW * 0.68, 66, pageW * 0.5, 76)
    .bezierCurveTo(pageW * 0.3, 86, pageW * 0.15, 76, 0, 68)
    .closePath()
    .fillColor("#0B3A66")
    .fill();
  doc.restore();

  drawHeaderEmblem(doc, 26, 6);

  // Header Title & Director Subtitle
  const titleX = 114;
  const titleW = 540;
  doc
    .font("Helvetica-Bold")
    .fontSize(24)
    .fillColor("#FFFFFF")
    .text("Avaliação da Gestão Escolar", titleX, 13, {
      width: titleW,
      align: "center",
      lineBreak: false,
    });

  const subtitleParts = [report.director];
  if (report.unit) subtitleParts.push(report.unit);
  if (report.cycle) subtitleParts.push(`Ciclo ${report.cycle}`);
  doc
    .font("Helvetica-Bold")
    .fontSize(13.5)
    .fillColor("#DCEBFA")
    .text(subtitleParts.join("  |  "), titleX, 45, {
      width: titleW,
      align: "center",
      ellipsis: true,
      lineBreak: false,
    });

  // Right motto
  doc
    .font("Helvetica-BoldOblique")
    .fontSize(11)
    .fillColor("#FFFFFF")
    .text("Juntos por uma\neducação cada vez\nmelhor!", pageW - 172, 14, {
      width: 148,
      align: "center",
      lineGap: 1,
    });

  // --- 2. THREE KPI CARDS (UNIQUE PLACE FOR AVERAGES & STARS) ---
  const orderedKeys = Object.keys(report.groups);
  const displayEntries: Array<[string, GroupDashboard]> = orderedKeys.map((key) => [
    key,
    report.groups[key],
  ]);
  const cardGap = 14;
  const cardCount = Math.max(1, displayEntries.length);
  const cardW = (contentW - cardGap * (cardCount - 1)) / cardCount;
  const cardY = 98;
  const cardH = 98;

  displayEntries.forEach(([groupKey, summary], index) => {
    const theme = groupThemes[groupKey] ?? {
      key: groupKey,
      label: groupKey,
      bg: "#F0F4F8",
      cardTint: "#F9FBFD",
      border: "#9FB3C8",
      dark: "#1F3A56",
      accent: "#335C81",
    };
    const x = marginX + index * (cardW + cardGap);

    doc.save();
    doc
      .roundedRect(x, cardY, cardW, cardH, 12)
      .lineWidth(1.2)
      .fillAndStroke(theme.bg, theme.border);
    doc.restore();

    // Left circular icon
    drawGroupIcon(doc, groupKey, x + 42, cardY + 49, 27, theme.accent, true);

    const textX = x + 78;
    const textW = cardW - 88;

    doc
      .font("Helvetica-Bold")
      .fontSize(12.5)
      .fillColor(theme.dark)
      .text(theme.label, textX, cardY + 9, {
        width: textW,
        align: "center",
        lineBreak: false,
      });

    const meanText =
      summary.overall.mean === null ? "—" : formatDecimal(summary.overall.mean);
    doc
      .font("Helvetica-Bold")
      .fontSize(29)
      .fillColor(theme.dark)
      .text(meanText, textX, cardY + 25, {
        width: textW,
        align: "center",
        lineBreak: false,
      });

    drawStars(
      doc,
      textX + textW / 2,
      cardY + 66,
      summary.overall.mean,
      summary.overall.scale.max,
    );

    const participantLabel =
      summary.submissions === 1
        ? "1 participante"
        : `${summary.submissions} participantes`;
    doc
      .font("Helvetica")
      .fontSize(8.2)
      .fillColor("#4B5B6B")
      .text(
        `${participantLabel}  ·  escala ${summary.overall.scale.min} a ${summary.overall.scale.max}`,
        textX,
        cardY + 81,
        {
          width: textW,
          align: "center",
          lineBreak: false,
        },
      );
  });

  // --- 3. MAIN PANEL: SYNTHESES, STRENGTHS & ATTENTION POINTS ---
  const panelY = 208;
  const panelH = 298;
  const barH = 31;

  doc.save();
  doc
    .roundedRect(marginX, panelY, contentW, panelH, 12)
    .lineWidth(1.2)
    .fillAndStroke("#FFFFFF", "#14497A");

  // Navy top bar inside panel
  doc.save();
  doc.roundedRect(marginX, panelY, contentW, panelH, 12).clip();
  doc.rect(marginX, panelY, contentW, barH).fillColor("#0B3A66").fill();
  doc.restore();

  // Gold star badge on panel header
  starPath(doc, marginX + 20, panelY + barH / 2, 10.5, 4.8);
  doc.fillColor("#F5B400").fill();
  starPath(doc, marginX + 20, panelY + barH / 2, 10.5, 4.8);
  doc.lineWidth(0.9).strokeColor("#0B3A66").stroke();

  doc
    .font("Helvetica-Bold")
    .fontSize(13)
    .fillColor("#FFFFFF")
    .text(
      "Sínteses por Público, Pontos Fortes e Aspectos de Atenção",
      marginX + 38,
      panelY + 9,
      { width: contentW - 50, lineBreak: false },
    );
  doc.restore();

  // Three inner columns
  const colPad = 10;
  const colGap = 10;
  const colW = (contentW - colPad * 2 - colGap * (cardCount - 1)) / cardCount;
  const colY = panelY + barH + 10;
  const colH = panelH - barH - 20;
  const colHeaderH = 25;

  displayEntries.forEach(([groupKey, summary], index) => {
    const theme = groupThemes[groupKey] ?? {
      key: groupKey,
      label: groupKey,
      bg: "#F0F4F8",
      cardTint: "#F9FBFD",
      border: "#9FB3C8",
      dark: "#1F3A56",
      accent: "#335C81",
    };
    const colX = marginX + colPad + index * (colW + colGap);

    doc.save();
    doc
      .roundedRect(colX, colY, colW, colH, 9)
      .lineWidth(1)
      .fillAndStroke(theme.cardTint, theme.border);

    doc.save();
    doc.roundedRect(colX, colY, colW, colH, 9).clip();
    doc.rect(colX, colY, colW, colHeaderH).fillColor(theme.accent).fill();
    doc.restore();
    doc.restore();

    // Mini icon + group label in column header
    drawGroupIcon(doc, groupKey, colX + 20, colY + colHeaderH / 2, 10, theme.accent, false);
    doc
      .font("Helvetica-Bold")
      .fontSize(10.8)
      .fillColor("#FFFFFF")
      .text(theme.label, colX + 36, colY + 7, {
        width: colW - 44,
        lineBreak: false,
      });

    const synthesis: ReportSynthesis | null = report.syntheses[groupKey] ?? null;
    const { highest, lowest } = pickHighlightQuestions(summary);
    const innerX = colX + 9;
    const innerW = colW - 18;
    const maxBottomY = colY + colH - 8;
    let cursorY = colY + colHeaderH + 9;

    if (synthesis) {
      cursorY = drawSectionBlock(
        doc,
        "info",
        "Impressão Geral",
        "#0B3A66",
        synthesis.perception,
        null,
        innerX,
        cursorY,
        innerW,
        Math.min(maxBottomY - 122, cursorY + 70),
      );

      const topRef = highest
        ? `Destaque (${formatDecimal(highest.mean)}): ${cleanQuestionText(highest.question, 96)}`
        : null;
      cursorY = drawSectionBlock(
        doc,
        "check",
        "Ponto Forte",
        "#195B2B",
        synthesis.strength,
        topRef,
        innerX,
        cursorY,
        innerW,
        Math.min(maxBottomY - 62, cursorY + 88),
      );

      const lowRef =
        lowest && lowest.mean < summary.overall.scale.max
          ? `Menor nota (${formatDecimal(lowest.mean)}): ${cleanQuestionText(lowest.question, 96)}`
          : null;
      drawSectionBlock(
        doc,
        "alert",
        "Aspecto de Atenção",
        "#B93C00",
        synthesis.attention,
        lowRef,
        innerX,
        cursorY,
        innerW,
        maxBottomY,
      );
    } else if (highest || lowest) {
      const strongText = highest
        ? `${cleanQuestionText(highest.question, 130)} — ${formatDecimal(highest.mean)}`
        : "Não há perguntas avaliadas para destacar.";
      cursorY = drawSectionBlock(
        doc,
        "check",
        "Ponto Forte",
        "#195B2B",
        strongText,
        null,
        innerX,
        cursorY,
        innerW,
        Math.min(maxBottomY - 88, cursorY + 100),
      );

      const lowText =
        lowest && lowest.mean < summary.overall.scale.max
          ? `${cleanQuestionText(lowest.question, 130)} — ${formatDecimal(lowest.mean)}`
          : "Todas as perguntas avaliadas por este público atingiram a nota máxima.";
      drawSectionBlock(
        doc,
        "alert",
        "Menor Avaliação",
        "#B93C00",
        lowText,
        null,
        innerX,
        cursorY,
        innerW,
        maxBottomY,
      );
    } else {
      const emptyNote =
        summary.overall.note ??
        "Ainda não há síntese registrada nem detalhamento de perguntas para este público.";
      drawSectionBlock(
        doc,
        "info",
        "Situação",
        "#0B3A66",
        emptyNote,
        null,
        innerX,
        cursorY,
        innerW,
        maxBottomY,
      );
    }
  });

  // --- 4. FOOTER (METHODOLOGY & MOTTO — NO REPEATED CONCLUSION) ---
  // Bottom decorative wave
  doc.save();
  doc
    .moveTo(0, pageH - 22)
    .bezierCurveTo(pageW * 0.25, pageH - 12, pageW * 0.65, pageH - 6, pageW, pageH - 36)
    .lineTo(pageW, pageH)
    .lineTo(0, pageH)
    .closePath()
    .fillColor("#1A6BC4")
    .fill();

  doc
    .moveTo(pageW * 0.58, pageH - 10)
    .bezierCurveTo(pageW * 0.76, pageH - 16, pageW * 0.9, pageH - 26, pageW, pageH - 42)
    .lineTo(pageW, pageH - 30)
    .bezierCurveTo(pageW * 0.88, pageH - 14, pageW * 0.74, pageH - 8, pageW * 0.58, pageH - 4)
    .closePath()
    .fillColor("#F5B400")
    .fill();
  doc.restore();

  // Navy methodology pill on left
  const footerX = marginX;
  const footerY = 516;
  const footerW = 556;
  const footerH = 54;

  doc.save();
  doc.roundedRect(footerX, footerY, footerW, footerH, 16).fillColor("#0B3A66").fill();

  // Small info icon inside footer pill
  doc
    .circle(footerX + 27, footerY + footerH / 2, 13)
    .lineWidth(1.5)
    .strokeColor("#F5B400")
    .stroke();
  doc.circle(footerX + 27, footerY + footerH / 2 - 4.5, 1.6).fillColor("#FFFFFF").fill();
  doc
    .lineWidth(2.2)
    .lineCap("round")
    .strokeColor("#FFFFFF")
    .moveTo(footerX + 27, footerY + footerH / 2 - 1)
    .lineTo(footerX + 27, footerY + footerH / 2 + 6)
    .stroke();
  doc.restore();

  doc
    .font("Helvetica-Bold")
    .fontSize(9.5)
    .fillColor("#F5C542")
    .text("Nota Metodológica", footerX + 50, footerY + 8, {
      width: footerW - 62,
      lineBreak: false,
    });

  const metaLine1 =
    "Médias calculadas na escala de 1 a 5 considerando todas as respostas válidas disponíveis de cada público.";
  const metaLine2 = `Versão v${report.version}  ·  Emitido em ${formatDateBr(report.issuedAt)}  ·  Devolutiva para encaminhamento externo pela SME.`;

  doc
    .font("Helvetica")
    .fontSize(7.9)
    .fillColor("#E8F1FA")
    .text(metaLine1, footerX + 50, footerY + 22, {
      width: footerW - 62,
      lineBreak: false,
      ellipsis: true,
    })
    .text(metaLine2, footerX + 50, footerY + 35, {
      width: footerW - 62,
      lineBreak: false,
      ellipsis: true,
    });

  // Right closing motto
  doc
    .font("Helvetica-BoldOblique")
    .fontSize(12.5)
    .fillColor("#0B3A66")
    .text("Educação de qualidade\nse constrói em parceria!", footerX + footerW + 18, footerY + 10, {
      width: contentW - footerW - 18,
      align: "center",
      lineGap: 1.5,
    });

  doc.end();
  return complete;
}
