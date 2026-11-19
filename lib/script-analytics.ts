import { nameKey, referenceIndex, speakerName, splitScript, type NamedReference } from "./production";
import { hasBlockContent, sceneFields, sceneText, type ScreenplayBlock, type TextBlockKind } from "./screenplay";

export const linesPerPage = 55;
const columns: Record<TextBlockKind, number> = {
  sceneHeading: 60,
  action: 60,
  character: 38,
  parenthetical: 28,
  dialogue: 35,
  transition: 34,
};
const graphemes = new Intl.Segmenter("th", { granularity: "grapheme" });
const words = new Intl.Segmenter("th", { granularity: "word" });

function wrappedLines(text: string, width: number) {
  const content = text.trim();
  if (!content) return 0;
  let lines = 0;
  for (const line of content.split(/\r?\n/)) {
    let length = 0;
    for (const _ of graphemes.segment(line)) length++;
    lines += Math.max(1, Math.ceil(length / width));
  }
  return lines;
}

export function estimateRuntime(blocks: ScreenplayBlock[]) {
  let lines = 0;
  for (const block of blocks) {
    if (!hasBlockContent(block)) continue;
    const extras = Math.max(wrappedLines(block.visual ?? "", 32), wrappedLines(block.audio ?? "", 32));
    if (block.kind === "audioVisual") {
      lines += extras + Number(lines > 0);
      continue;
    }
    const scene = block.kind === "sceneHeading" ? sceneFields(block) : null;
    const text = scene?.location.trim() ? sceneText(scene) : block.text;
    const gap = block.kind === "character" || block.kind === "action" ||
      block.kind === "sceneHeading" || block.kind === "transition" ? 1 : 0;
    lines += Math.max(wrappedLines(text, columns[block.kind]), extras) + (lines > 0 ? gap : 0);
  }
  const pages = Math.ceil(lines / linesPerPage);
  return { pages, minutes: pages };
}

interface DialogueCount { name: string; lines: number; words: number }

export function analyzeScript(blocks: ScreenplayBlock[], characters: NamedReference[] = [], locations: NamedReference[] = []) {
  const { scenes } = splitScript(blocks);
  const cast = referenceIndex(characters);
  const places = referenceIndex(locations);
  const times = { DAY: 0, NIGHT: 0, DAWN: 0, CONTINUOUS: 0 };
  const settings = { "INT.": 0, "EXT.": 0 };
  const usage = new Map<string, { name: string; count: number }>();
  const dialogue = new Map<string, DialogueCount>(characters.map(({ name }) => [nameKey(name), { name, lines: 0, words: 0 }]));
  const usedScenes = scenes.filter(({ blocks }) => blocks.some(hasBlockContent));

  for (const { heading } of usedScenes) {
    const fields = sceneFields(heading);
    times[fields.time]++;
    settings[fields.setting]++;
    const location = fields.location.trim();
    if (location) {
      const name = places.get(nameKey(location))?.name ?? location;
      const key = nameKey(name);
      const entry = usage.get(key) ?? { name, count: 0 };
      entry.count++;
      usage.set(key, entry);
    }
  }

  let speaker = "";
  for (const block of blocks) {
    if (block.kind === "character") {
      speaker = speakerName(block.text);
      const profile = cast.get(nameKey(speaker));
      if (profile) speaker = profile.name;
      const key = nameKey(speaker);
      if (key && !dialogue.has(key)) dialogue.set(key, { name: speaker, lines: 0, words: 0 });
    } else if (block.kind === "sceneHeading" || block.kind === "transition" ||
        (block.kind === "action" && hasBlockContent(block))) {
      speaker = "";
    } else if (block.kind === "dialogue" && block.text.trim()) {
      const key = nameKey(speaker);
      const count = dialogue.get(key) ?? { name: speaker || "ไม่ระบุผู้พูด", lines: 0, words: 0 };
      count.lines += block.text.split(/\r?\n/).filter((line) => line.trim()).length;
      for (const word of words.segment(block.text)) {
        if (word.isWordLike) count.words++;
      }
      dialogue.set(key, count);
    }
  }

  return {
    ...estimateRuntime(blocks),
    scenes: usedScenes.length,
    times,
    settings,
    locations: [...usage.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "th")),
    dialogue: [...dialogue.values()].sort((a, b) => b.lines - a.lines || b.words - a.words || a.name.localeCompare(b.name, "th")),
  };
}
