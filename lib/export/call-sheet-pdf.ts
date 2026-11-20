import {
  callDate, callFilename, callHeaderGroups, castCells, castColumns, shootingCells, shootingColumns, type CallDocument,
} from "../call-sheet";
import { createPdf, drawPdfLine, wrapPdfText, type PDFDocument, type TextStyle } from "./pdf";

const width = 841.89;
const height = 595.28;
const margin = 24;
const contentWidth = width - 2 * margin;
const bottom = height - 27;
const red = "#a02d3b";
const graphite = "#292932";
const rule = "#bfc0c6";

interface Column {
  label: string;
  weight: number;
}

function render(pdf: PDFDocument, sheet: CallDocument) {
  const { header } = sheet;
  let page = 0;
  let y = margin;

  function nextPage() {
    pdf.addPage();
    pdf.lineWidth(0.45);
    const first = ++page === 1;
    y = margin;
    pdf.rect(margin, y, contentWidth, 32).fill(red);
    drawPdfLine(pdf, "ใบคิวถ่ายทำ / CALL SHEET", margin + 9, y + 21, contentWidth - 18, {
      size: 14, bold: true, color: "#ffffff",
    });
    drawPdfLine(pdf, [header.queue, header.version && `V${header.version}`].filter(Boolean).join("  /  "),
      margin + 9, y + 21, contentWidth - 18, { size: 12, bold: true, color: "#ffffff", align: "right" });
    y += 32;
    if (!first) {
      const identity = [header.title, callDate(header.date)].filter(Boolean).join(" / ");
      for (const line of wrapPdfText(pdf, identity, contentWidth - 16, { size: 9 }).slice(0, 3)) {
        drawPdfLine(pdf, line, margin + 8, y + 12, contentWidth - 16, { size: 9, bold: true });
        y += 13;
      }
      y += 4;
    }
    drawPdfLine(pdf, `หน้า ${page}`, margin, height - 13, contentWidth, { size: 8, align: "right" });
  }

  function table(columns: readonly Column[], records: string[][], options: {
    size?: number;
    centered?: number;
    band?: string;
    compact?: boolean;
  } = {}) {
    const weight = columns.reduce((total, column) => total + column.weight, 0);
    const widths = columns.map((column) => column.weight / weight * contentWidth);
    const padding = options.compact ? 2 : 4;
    const size = options.size ?? 9;
    const lineHeight = size + 4;

    function linesFor(values: string[], style: TextStyle) {
      return columns.map((_, index) => wrapPdfText(pdf, values[index] ?? "", widths[index] - padding * 2, style));
    }

    function drawRow(lines: string[][], offset: number, count: number, style: TextStyle, fill: string) {
      const rowHeight = count * lineHeight + padding * 2;
      let x = margin;
      lines.forEach((values, column) => {
        const w = widths[column];
        pdf.rect(x, y, w, rowHeight).fillAndStroke(fill, rule);
        const align = column < (options.centered ?? 0) ? "center" : undefined;
        values.slice(offset, offset + count).forEach((value, index) => {
          drawPdfLine(pdf, value, x + padding, y + padding + size + index * lineHeight, w - padding * 2, { ...style, align });
        });
        x += w;
      });
      y += rowHeight;
    }

    const headingStyle = { size, bold: true, color: "#ffffff" };
    const headings = linesFor(columns.map(({ label }) => label), headingStyle);
    const headingLines = Math.max(...headings.map((lines) => lines.length));
    const headerHeight = headingLines * lineHeight + padding * 2 + (options.band ? 19 : 0);

    function drawHeader() {
      if (options.band) {
        pdf.rect(margin, y, contentWidth, 19).fill(graphite);
        drawPdfLine(pdf, options.band, margin + 7, y + 13, contentWidth - 14, { size: 9, bold: true, color: "#ffffff" });
        y += 19;
      }
      drawRow(headings, 0, headingLines, headingStyle, "#46434c");
    }

    if (y + headerHeight + lineHeight + padding * 2 > bottom) nextPage();
    drawHeader();
    const textStyle = { size };
    records.forEach((record, row) => {
      const lines = linesFor(record, textStyle);
      const count = Math.max(...lines.map((values) => values.length));
      const fill = row % 2 ? "#f5f2f1" : "#ffffff";
      for (let offset = 0; offset < count;) {
        let available = Math.floor((bottom - y - padding * 2) / lineHeight);
        if (available < 1 || (offset === 0 && available < count && count * lineHeight <= 400)) {
          nextPage();
          drawHeader();
          available = Math.floor((bottom - y - padding * 2) / lineHeight);
        }
        const take = Math.min(available, count - offset);
        drawRow(lines, offset, take, textStyle, fill);
        offset += take;
      }
    });
    y += options.compact ? 3 : 9;
  }

  nextPage();
  for (const [index, group] of callHeaderGroups.entries()) {
    table(group.map(({ key, label }) => ({
      label, weight: key === "title" ? 5 : key === "location" || key === "date" ? 2 : 1,
    })), [group.map(({ key }) => (key === "date" ? callDate(header.date) : header[key]) || "—")],
    { size: index === 0 ? 11 : 9, compact: true });
  }
  table(shootingColumns, sheet.rows.map(shootingCells), { centered: 4, band: "ลำดับถ่ายทำ / Shooting Breakdown" });
  if (sheet.rows.some((row) => row.missing)) {
    if (y + 18 > bottom) nextPage();
    drawPdfLine(pdf, "* ฉากที่ถูกนำออกจากบท ใช้ข้อมูลที่บันทึกไว้", margin, y + 8, contentWidth, { size: 8 });
    y += 18;
  }
  table(castColumns, sheet.cast.map(castCells), { band: "นักแสดง / Cast Call", compact: true });
  if (sheet.productionNote.trim()) {
    table([{ label: "Production Note / หมายเหตุกองถ่าย", weight: 1 }], [[sheet.productionNote]], { size: 10 });
  }
}

export async function makeCallSheetPdf(sheet: CallDocument) {
  const name = callFilename(sheet);
  const blob = await createPdf(name, "landscape", (pdf) => render(pdf, sheet));
  return new File([blob], name + ".pdf", { type: "application/pdf" });
}
