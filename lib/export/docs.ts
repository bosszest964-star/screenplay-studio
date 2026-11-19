import { GoogleDrive, googleFetch } from "../google/drive";
import { exportText, isBold, type ExportScript, type ScriptTableRow } from "./representation";

const docsUrl = "https://docs.googleapis.com/v1/documents";
type Request = Record<string, object>;
const pt = (magnitude: number) => ({ magnitude, unit: "PT" });

function range(startIndex: number, endIndex: number) {
  return { startIndex, endIndex };
}

function textStyle(start: number, end: number, fontFamily: string, bold = false, fontSize = 12): Request {
  return {
    updateTextStyle: {
      range: range(start, end), textStyle: { weightedFontFamily: { fontFamily }, bold, fontSize: pt(fontSize) },
      fields: "weightedFontFamily,bold,fontSize",
    },
  };
}

function paragraphStyle(start: number, end: number, style: Record<string, unknown>): Request {
  return { updateParagraphStyle: { range: range(start, end), paragraphStyle: style, fields: Object.keys(style).join(",") } };
}

async function update(token: string, documentId: string, requests: Request[]) {
  if (!requests.length) return;
  await googleFetch(token, `${docsUrl}/${encodeURIComponent(documentId)}:batchUpdate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ requests }),
  });
}

const tableHead: ScriptTableRow = { visual: "ภาพ", audio: "เสียง", heading: true };

async function fillTables(token: string, documentId: string, rows: ScriptTableRow[][]) {
  const query = new URLSearchParams({ fields: "body(content(table(tableRows(tableCells(content(startIndex)))))" });
  const response = await googleFetch(token, `${docsUrl}/${encodeURIComponent(documentId)}?${query}`);
  type TableRow = { tableCells: { content: { startIndex: number }[] }[] };
  const data = await response.json() as { body: { content: { table?: { tableRows: TableRow[] } }[] } };
  const tables = data.body.content.flatMap((entry) => entry.table ? [entry.table.tableRows] : []);
  if (tables.length !== rows.length) throw new Error("จัดตารางภาพและเสียงใน Google Docs ไม่สำเร็จ");

  const cells: { start: number; text: string; bold: boolean }[] = [];
  for (let tableIndex = 0; tableIndex < rows.length; tableIndex++) {
    const table = tables[tableIndex];
    const target = rows[tableIndex];
    if (table.length !== target.length) throw new Error("จำนวนแถวในเอกสาร Google Docs ไม่ตรงกัน");
    for (let rowIndex = 0; rowIndex < target.length; rowIndex++) {
      const { visual, audio, heading } = target[rowIndex];
      [visual, audio].forEach((text, column) => {
        const start = table[rowIndex].tableCells[column]?.content[0]?.startIndex;
        if (!start) throw new Error("ไม่พบเซลล์ใน Google Docs");
        if (text) cells.push({ start, text, bold: rowIndex === 0 || Boolean(heading) });
      });
    }
  }
  cells.sort((a, b) => b.start - a.start);

  // Inserting from the end keeps earlier cell offsets valid across batches.
  for (let index = 0; index < cells.length; index += 60) {
    const batch = cells.slice(index, index + 60).flatMap(({ start, text, bold }) => [
      { insertText: { location: { index: start }, text } },
      textStyle(start, start + text.length, "Sarabun", bold),
    ]);
    await update(token, documentId, batch);
  }
}

export async function exportGoogleDoc(token: string, projectId: string, script: ExportScript) {
  const drive = new GoogleDrive(token);
  const root = await drive.workspace();
  const folder = await drive.projectFolder(root.id, { id: projectId, name: script.name });
  const document = await drive.create(script.name, "application/vnd.google-apps.document", folder.id);
  const title = exportText(script.name).replace(/\n/g, " ");
  const cover = `${title}\nบทภาพยนตร์\n`;
  try {
    const tables: ScriptTableRow[][] = [];
    const content = script.format === "two-column" ? "" : script.paragraphs.map(({ text }) => text).join("\n");
    if (script.format === "two-column") {
      for (let i = 0; i < Math.max(script.rows.length, 1); i += 60) {
        tables.push([tableHead, ...script.rows.slice(i, i + 60)]);
      }
    }

    const requests: Request[] = [
      { updateDocumentStyle: { documentStyle: { pageSize: { width: pt(595.28), height: pt(841.89) }, marginTop: pt(56), marginBottom: pt(56), marginLeft: pt(56), marginRight: pt(56) }, fields: "pageSize,marginTop,marginBottom,marginLeft,marginRight" } },
      { insertText: { location: { index: 1 }, text: cover + content } },
      textStyle(1, 1 + title.length, "Sarabun", true, 25),
      paragraphStyle(1, 1 + cover.length, { alignment: "CENTER", spaceBelow: pt(12) }),
      textStyle(title.length + 2, cover.length, "Sarabun"),
    ];

    if (tables.length) {
      await update(token, document.id, requests);
      await update(token, document.id, tables.map((table) => ({
        insertTable: { rows: table.length, columns: 2, endOfSegmentLocation: {} },
      })));
      await fillTables(token, document.id, tables);
    } else {
      let index = cover.length + 1;
      for (const [position, { kind, text }] of script.paragraphs.entries()) {
        if (text.length === 0) continue;
        const end = index + text.length;
        const standard = script.format === "international";
        const style: Record<string, unknown> = {
          alignment: standard && kind === "transition" ? "END" : "START",
          spaceBelow: pt(kind === "dialogue" || kind === "action" ? 6 : 2),
          ...(position === 0 && { pageBreakBefore: true }),
        };
        if (standard && kind === "character") style.indentStart = pt(155);
        if (standard && kind === "dialogue") { style.indentStart = pt(95); style.indentEnd = pt(80); }
        if (standard && kind === "parenthetical") { style.indentStart = pt(120); style.indentEnd = pt(82); }
        requests.push(paragraphStyle(index, end, style));
        requests.push(textStyle(index, end, standard && !/[\u0e00-\u0e7f]/u.test(text) && !isBold(kind) ? "Courier Prime" : "Sarabun", isBold(kind)));
        index = end + 1;
      }
      for (let start = 0; start < requests.length; start += 160) {
        await update(token, document.id, requests.slice(start, start + 160));
      }
    }
    return `https://docs.google.com/document/d/${encodeURIComponent(document.id)}/edit`;
  } catch (error) {
    await drive.patch(document.id, { trashed: true }).catch(() => undefined);
    throw error;
  }
}
