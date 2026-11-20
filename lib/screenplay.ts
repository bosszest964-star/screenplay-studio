import type { BeatCard, CharacterProfile, LocationProfile } from "./production";
import type { CallSheet } from "./call-sheet";

export const screenplayFormats = {
  international: "มาตรฐานสากล",
  thai: "บทสไตล์ไทย",
  "two-column": "ภาพและเสียง",
} as const;

export type ScreenplayFormat = keyof typeof screenplayFormats;

export const textBlockLabels = {
  sceneHeading: "หัวฉาก",
  action: "บรรยายภาพ",
  character: "ตัวละคร",
  parenthetical: "วงเล็บอารมณ์",
  dialogue: "บทพูด",
  transition: "เปลี่ยนฉาก",
} as const;

export type TextBlockKind = keyof typeof textBlockLabels;

export const sceneTimes = {
  DAY: "กลางวัน",
  NIGHT: "กลางคืน",
  DAWN: "รุ่งสาง",
  CONTINUOUS: "ต่อเนื่อง",
} as const;

export interface SceneHeading {
  setting: "INT." | "EXT.";
  location: string;
  time: keyof typeof sceneTimes;
}

export interface TextBlock {
  id: string;
  kind: TextBlockKind;
  text: string;
  scene?: SceneHeading;
  visual?: string;
  audio?: string;
}

export interface AudioVisualBlock {
  id: string;
  kind: "audioVisual";
  visual: string;
  audio: string;
}

export type ScreenplayBlock = TextBlock | AudioVisualBlock;

export type SpeedEntryKind = "dialogue" | "action" | "parenthetical";

export interface SpeedEntry {
  id: string;
  kind: SpeedEntryKind;
  character: string;
  text: string;
}

export interface SpeedSession {
  afterBlockId: string | null;
  entries: SpeedEntry[];
  characters: string[];
  character: string;
  kind: SpeedEntryKind;
  text: string;
}

export interface EditorDraft {
  format: ScreenplayFormat;
  blocks: ScreenplayBlock[];
  dialogueQuotes?: boolean;
  speedSession?: SpeedSession | null;
}

export type ProjectCover = "last-light" | "rain" | "mountains";

export interface Project extends EditorDraft {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  cover?: ProjectCover;
  editorRevision?: number;
  beats?: BeatCard[];
  characters?: CharacterProfile[];
  locations?: LocationProfile[];
  callSheets?: CallSheet[];
}

export function editorHref(id: string, sceneId?: string) {
  const uri = `/editor/?project=${encodeURIComponent(id)}`;
  return sceneId ? `${uri}&scene=${encodeURIComponent(sceneId)}` : uri;
}

export const enterKinds: Record<TextBlockKind, TextBlockKind> = {
  sceneHeading: "action",
  action: "action",
  character: "dialogue",
  parenthetical: "dialogue",
  dialogue: "action",
  transition: "sceneHeading",
};

const tabKinds: TextBlockKind[] = [
  "sceneHeading", "action", "character", "parenthetical", "dialogue", "transition",
];

export function cycleBlockKind(kind: TextBlockKind, backwards: boolean) {
  return tabKinds[(tabKinds.indexOf(kind) + (backwards ? -1 : 1) + tabKinds.length) % tabKinds.length];
}

export function newTextBlock(kind: TextBlockKind, text = ""): TextBlock {
  return { id: crypto.randomUUID(), kind, text };
}

const defaultScene: SceneHeading = { setting: "INT.", location: "", time: "DAY" };

export function sceneFields(block: TextBlock): SceneHeading {
  if (block.scene) return block.scene;
  const match = /^(INT\.|EXT\.)\s*(.*?)(?:\s+[-–—]\s+(DAY|NIGHT|DAWN|CONTINUOUS|กลางวัน|กลางคืน|รุ่งสาง|ต่อเนื่อง))?$/i.exec(block.text.trim());
  if (!match) return { ...defaultScene, location: block.text };
  const rawTime = match[3]?.toUpperCase();
  const time = (Object.keys(sceneTimes) as SceneHeading["time"][]).find(
    (key) => key === rawTime || sceneTimes[key] === rawTime,
  );
  return { setting: match[1].toUpperCase() as SceneHeading["setting"], location: match[2], time: time ?? "DAY" };
}

export function sceneText(scene: SceneHeading, format: ScreenplayFormat = "international") {
  const time = format === "thai" ? sceneTimes[scene.time] : scene.time;
  return `${scene.setting} ${scene.location.trim()} – ${time}`;
}

export function hasBlockContent(block: ScreenplayBlock) {
  if (block.visual?.trim() || block.audio?.trim()) return true;
  if (block.kind === "audioVisual") return false;
  return block.kind === "sceneHeading"
    ? Boolean(sceneFields(block).location.trim())
    : Boolean(block.text.trim());
}

export function distinctNames(names: string[]) {
  const unique = new Map<string, string>();
  for (const name of names) {
    const trimmed = name.trim();
    const key = trimmed.toLocaleLowerCase("th");
    if (trimmed && !unique.has(key)) unique.set(key, trimmed);
  }
  return [...unique.values()];
}

export function pendingSpeedEntry(session: SpeedSession): SpeedEntry | null {
  if (!session.text.trim() || (session.kind !== "action" && !session.character.trim())) return null;
  return {
    id: crypto.randomUUID(),
    kind: session.kind,
    character: session.kind === "action" ? "" : session.character,
    text: session.text.trim(),
  };
}

export function blocksFromSpeedEntries(entries: SpeedEntry[]) {
  const blocks: TextBlock[] = [];
  let speaker = "";
  for (const { id, kind, character, text } of entries) {
    if (kind === "action") {
      speaker = "";
    } else if (character !== speaker) {
      speaker = character;
      blocks.push(newTextBlock("character", speaker));
    }
    blocks.push({ id, kind, text });
  }
  return blocks;
}
