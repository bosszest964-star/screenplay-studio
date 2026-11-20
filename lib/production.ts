import {
  sceneFields, sceneText, type SceneHeading, type ScreenplayBlock, type TextBlock,
} from "./screenplay";

export const productionViews = {
  board: "Beat Board",
  characters: "ตัวละคร",
  locations: "สถานที่",
  analytics: "สถิติบท",
  schedule: "ใบคิวถ่ายทำ",
} as const;

export type ProductionView = keyof typeof productionViews;

export function productionHref(projectId: string, view: ProductionView = "board", reference?: string) {
  const query = new URLSearchParams({ project: projectId, view });
  if (reference) query.set("reference", reference);
  return `/production/?${query}`;
}

export const beatColors = {
  sand: "เหลือง",
  lilac: "ม่วง",
  pink: "ชมพู",
  mint: "เขียว",
  blue: "ฟ้า",
} as const;

export type BeatColor = keyof typeof beatColors;

export interface BeatCard {
  id: string;
  title: string;
  notes: string;
  color: BeatColor;
  scene: SceneHeading;
  sceneId?: string;
  castIds?: string[];
}

export interface NamedReference {
  id: string;
  name: string;
  aliases?: string[];
  imageId?: string;
}

export interface CharacterProfile extends NamedReference {
  age?: number;
  personality: string;
  backstory: string;
}

export interface LocationProfile extends NamedReference {
  description: string;
  lighting: string;
}

export interface ScriptScene {
  heading: TextBlock;
  blocks: ScreenplayBlock[];
}

export function nameKey(name: string) {
  return name.trim().replace(/\s+/g, " ").normalize("NFC").toLocaleLowerCase("th");
}

export function speakerName(name: string) {
  return name.trim().replace(/(?:\s*\((?:V\.?O\.?|O\.?S\.?|CONT['’]?D)\))+$/i, "").trim();
}

export function referenceIndex<T extends NamedReference>(references: T[]) {
  const index = new Map<string, T>();
  for (const reference of references) {
    for (const name of [reference.name, ...(reference.aliases ?? [])]) index.set(nameKey(name), reference);
  }
  return index;
}

export function splitScript(blocks: ScreenplayBlock[]) {
  const opening: ScreenplayBlock[] = [];
  const scenes: ScriptScene[] = [];
  let section = opening;
  for (const block of blocks) {
    if (block.kind === "sceneHeading") {
      section = [];
      scenes.push({ heading: block, blocks: section });
    }
    section.push(block);
  }
  return { opening, scenes };
}

export function boardCards(blocks: ScreenplayBlock[], saved: BeatCard[] = []) {
  const { scenes } = splitScript(blocks);
  const ids = new Set(scenes.map(({ heading }) => heading.id));
  const linked = new Map<string, BeatCard>();
  const plans = new Map<string | undefined, BeatCard[]>();
  let anchor: string | undefined;

  for (const card of saved) {
    const sceneId = card.sceneId ?? card.id;
    if (ids.has(sceneId)) {
      linked.set(sceneId, card);
      anchor = sceneId;
    } else if (!card.sceneId || card.title || card.notes || card.color !== "sand" || card.castIds?.length) {
      const group = plans.get(anchor) ?? [];
      group.push({ ...card, sceneId: undefined });
      plans.set(anchor, group);
    }
  }

  return [
    ...(plans.get(undefined) ?? []),
    ...scenes.flatMap(({ heading }) => {
      const card: BeatCard = {
        id: heading.id,
        title: "",
        notes: "",
        color: "sand",
        ...linked.get(heading.id),
        scene: sceneFields(heading),
        sceneId: heading.id,
      };
      return [card, ...(plans.get(heading.id) ?? [])];
    }),
  ];
}

export function orderScriptByBoard(blocks: ScreenplayBlock[], cards: BeatCard[]) {
  const { opening, scenes } = splitScript(blocks);
  const remaining = new Map(scenes.map((scene) => [scene.heading.id, scene.blocks]));
  const ordered = [...opening];
  for (const card of cards) {
    if (!card.sceneId) continue;
    const section = remaining.get(card.sceneId);
    if (!section) continue;
    ordered.push(...section);
    remaining.delete(card.sceneId);
  }
  for (const section of remaining.values()) ordered.push(...section);
  return ordered.every((block, index) => block === blocks[index]) ? blocks : ordered;
}

export function beatTitle(card: BeatCard) {
  return card.title || (card.scene.location.trim() ? sceneText(card.scene) : "หัวฉากใหม่");
}
