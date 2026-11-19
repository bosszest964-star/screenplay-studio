import type PdfKit from "pdfkit";
import { isBold, type ExportScript, type ParagraphKind } from "./representation";

type PDFDocument = InstanceType<typeof PdfKit>;
const width = 595.28;
const height = 841.89;
const margin = 56;
const contentWidth = width - margin * 2;
const top = 60;
const bottom = height - 57;
const lineHeight = 18;

const fonts = [
  ["Sarabun", "Sarabun-Regular.ttf"],
  ["Sarabun Bold", "Sarabun-Bold.ttf"],
  ["Courier Prime", "CourierPrime-Regular.ttf"],
] as const;

let fontPromise: Promise<Array<readonly [string, ArrayBuffer]>> | undefined;
const wordBreaks = new Intl.Segmenter("th", { granularity: "word" });
const graphemeBreaks = new Intl.Segmenter("th", { granularity: "grapheme" });
const hasThai = /[\u0e00-\u0e7f]/u;

function fontFiles() {
  fontPromise ??= Promise.all(fonts.map(async ([font, name]) => {
    const response = await fetch(`/fonts/${name}`);
    if (!response.ok) throw new Error("โหลดฟอนต์สำหรับ PDF ไม่สำเร็จ");
    return [font, await response.arrayBuffer()] as const;
  })).catch((error) => { fontPromise = undefined; throw error; });
  return fontPromise;
}

const indents: Partial<Record<ParagraphKind, [number, number]>> = {
  character: [165, 25], dialogue: [95, 80], parenthetical: [125, 82], transition: [120, 0],
};

interface Style {
  size: number;
  bold?: boolean;
  international?: boolean;
  align?: "center" | "right";
}

function runs(text: string, style: Style) {
  if (style.bold) return [{ text, font: "Sarabun Bold" }];
  if (!style.international) return [{ text, font: "Sarabun" }];
  return text.split(/([\u0e00-\u0e7f]+(?:[ \t]+[\u0e00-\u0e7f]+)*)/u).filter(Boolean)
    .map((part) => ({ text: part, font: hasThai.test(part) ? "Sarabun" : "Courier Prime" }));
}

function measure(pdf: PDFDocument, text: string, style: Style) {
  return runs(text, style).reduce((length, run) =>
    length + pdf.font(run.font).fontSize(style.size).widthOfString(run.text), 0);
}

function wrap(pdf: PDFDocument, text: string, limit: number, style: Style) {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    let line = "";
    for (const { segment } of wordBreaks.segment(paragraph)) {
      if (!line && !segment.trim()) continue;
      if (measure(pdf, line + segment, style) <= limit) {
        line += segment;
        continue;
      }
      if (line.trim()) lines.push(line.trimEnd());
      line = "";
      if (measure(pdf, segment, style) <= limit) {
        line = segment.trimStart();
        continue;
      }
      for (const { segment: cluster } of graphemeBreaks.segment(segment)) {
        if (line && measure(pdf, line + cluster, style) > limit) {
          lines.push(line);
          line = "";
        }
        line += cluster;
      }
    }
    lines.push(line.trimEnd());
  }
  return lines;
}

function drawLine(pdf: PDFDocument, text: string, x: number, y: number, box: number, style: Style) {
  if (!text) return;
  const length = measure(pdf, text, style);
  let left = x + (style.align === "right" ? box - length : style.align === "center" ? (box - length) / 2 : 0);

  // Preserve logical Thai text for search/copy while the renderer shapes its combining marks.
  pdf.markContent("Span", { actual: text });
  for (const run of runs(text, style)) {
    pdf.font(run.font).fontSize(style.size).fillColor("#19151c");
    pdf.text(run.text, left, y, { lineBreak: false, baseline: "alphabetic" });
    left += pdf.widthOfString(run.text);
  }
  pdf.endMarkedContent();
}

function render(pdf: PDFDocument, script: ExportScript) {
  pdf.addPage();
  const titleStyle = { size: 27, bold: true, align: "center" } as const;
  const title = wrap(pdf, script.name, contentWidth, titleStyle);
  title.forEach((text, index) => drawLine(pdf, text, margin, 250 + index * 37, contentWidth, titleStyle));
  drawLine(pdf, "บทภาพยนตร์", margin, 250 + title.length * 37, contentWidth, { size: 13, align: "center" });

  let page = 0;
  let y = top;
  function nextPage() {
    pdf.addPage();
    drawLine(pdf, String(++page), margin, height - 29, contentWidth, { size: 10, align: "center" });
    y = top;
  }

  if (script.format !== "two-column") {
    if (!script.paragraphs.length) return;
    nextPage();
    const international = script.format === "international";
    for (const { kind, text } of script.paragraphs) {
      const [left, right] = international ? indents[kind] ?? [0, 0] : [0, 0];
      const box = contentWidth - left - right;
      const style: Style = { size: 12, international, bold: isBold(kind), align: international && kind === "transition" ? "right" : undefined };
      if (kind === "sceneHeading") y += 5;
      for (const line of wrap(pdf, text, box, style)) {
        if (y + lineHeight > bottom) nextPage();
        drawLine(pdf, line, margin + left, y + 13, box, style);
        y += lineHeight;
      }
      y += kind === "dialogue" || kind === "action" ? 5 : 2;
    }
    return;
  }

  const cellWidth = contentWidth / 2;
  const padding = 7;
  const box = cellWidth - padding * 2;

  function drawRow(visual: string[], audio: string[], count: number, style: Style, header = false) {
    const rowHeight = count * lineHeight + padding * 2;
    if (header) pdf.rect(margin, y, contentWidth, rowHeight).fill("#eeeaf7");
    pdf.lineWidth(0.5).strokeColor("#bcb7c5").rect(margin, y, contentWidth, rowHeight).stroke()
      .moveTo(margin + cellWidth, y).lineTo(margin + cellWidth, y + rowHeight).stroke();
    for (const [column, lines] of [visual, audio].entries()) {
      lines.forEach((text, index) => {
        drawLine(pdf, text, margin + column * cellWidth + padding, y + padding + 13 + index * lineHeight, box, style);
      });
    }
    y += rowHeight;
  }

  function tablePage() {
    nextPage();
    drawRow(["ภาพ"], ["เสียง"], 1, { size: 12, bold: true }, true);
  }

  tablePage();
  for (const row of script.rows) {
    const style = { size: 12, bold: row.heading };
    const visual = wrap(pdf, row.visual, box, style);
    const audio = wrap(pdf, row.audio, box, style);
    const lines = Math.max(visual.length, audio.length);
    for (let offset = 0; offset < lines;) {
      let available = Math.floor((bottom - y - padding * 2) / lineHeight);
      if (available <= 0) {
        tablePage();
        available = Math.floor((bottom - y - padding * 2) / lineHeight);
      }
      const count = Math.min(available, lines - offset);
      drawRow(visual.slice(offset, offset + count), audio.slice(offset, offset + count), count, style);
      offset += count;
    }
  }
}

export async function downloadScriptPdf(script: ExportScript) {
  const [{ default: PdfDocument }, files] = await Promise.all([import("pdfkit"), fontFiles()]);
  const pdf = new PdfDocument({
    autoFirstPage: false, size: "A4", margin: 0, font: "", lang: "th", pdfVersion: "1.7", info: { Title: script.name },
  });
  for (const [font, bytes] of files) pdf.registerFont(font, bytes);
  pdf.font("Sarabun");
  const file = await new Promise<Blob>((resolve, reject) => {
    const chunks: Uint8Array<ArrayBuffer>[] = [];
    pdf.on("data", (chunk: Uint8Array) => chunks.push(Uint8Array.from(chunk)));
    pdf.on("error", reject);
    pdf.on("end", () => resolve(new Blob(chunks, { type: "application/pdf" })));
    render(pdf, script);
    pdf.end();
  });

  const link = document.createElement("a");
  link.href = URL.createObjectURL(file);
  link.download = (script.name.replace(/[\\/:*?"<>|\r\n]/g, "_").trim() || "screenplay") + ".pdf";
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(link.href), 30_000);
}
