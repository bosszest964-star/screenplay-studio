import {
  hasBlockContent, sceneFields, sceneText, type EditorDraft, type ScreenplayFormat, type TextBlockKind,
} from "../screenplay";

export type ExportSource = Pick<EditorDraft, "blocks" | "format" | "dialogueQuotes"> & { name: string };
export type ParagraphKind = TextBlockKind | "note";

export interface ScriptParagraph {
  kind: ParagraphKind;
  text: string;
}

export interface ScriptTableRow {
  visual: string;
  audio: string;
  heading?: boolean;
}

export interface ExportScript {
  name: string;
  format: ScreenplayFormat;
  paragraphs: ScriptParagraph[];
  rows: ScriptTableRow[];
}

const audioKinds = new Set<TextBlockKind>(["character", "parenthetical", "dialogue"]);

export function exportText(value: string) {
  // Docs removes these code points on insertion, so exclude them before calculating offsets.
  return value.replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000b-\u001f\ue000-\uf8ff]/g, "");
}

export function representScript(project: ExportSource): ExportScript {
  const paragraphs: ScriptParagraph[] = [];
  const rows: ScriptTableRow[] = [];
  const quotes = project.dialogueQuotes ?? project.format === "thai";
  const international = project.format === "international";
  let sceneNumber = 0;

  for (const block of project.blocks) {
    if (block.kind === "sceneHeading") sceneNumber++;
    if (!hasBlockContent(block)) continue;
    const visual = exportText(block.visual ?? "");
    const audio = exportText(block.audio ?? "");
    let text = "";
    if (block.kind !== "audioVisual") {
      text = exportText(block.text);
      if (block.kind === "sceneHeading") text = `${sceneNumber}. ${exportText(sceneText(sceneFields(block), project.format))}`;
      if (block.kind === "parenthetical" && !/^\([\s\S]*\)$/.test(text)) text = `(${text})`;
      if (block.kind === "dialogue" && quotes && !/^“[\s\S]*”$|^"[\s\S]*"$/.test(text)) text = `“${text}”`;
      if (international && (block.kind === "character" || block.kind === "transition")) text = text.toUpperCase();
      if (text.trim()) paragraphs.push({ kind: block.kind, text });
    }
    if (visual.trim()) paragraphs.push({ kind: "note", text: `ภาพ: ${visual}` });
    if (audio.trim()) paragraphs.push({ kind: "note", text: `เสียง: ${audio}` });

    const goesInAudio = block.kind !== "audioVisual" && audioKinds.has(block.kind);
    const join = (first: string, second: string) => [first, second].filter((value) => value.trim()).join("\n");
    rows.push({
      visual: goesInAudio ? visual : join(text, visual),
      audio: goesInAudio ? join(text, audio) : audio,
      heading: block.kind === "sceneHeading",
    });
  }

  return { name: exportText(project.name).trim() || "บทภาพยนตร์", format: project.format, paragraphs, rows };
}

export function isBold(kind: ParagraphKind) {
  return kind === "sceneHeading" || kind === "character" || kind === "transition";
}

export function printHref(projectId: string) {
  return `/print/?project=${encodeURIComponent(projectId)}`;
}
