import { boardCards, nameKey, orderScriptByBoard, type BeatCard, type CharacterProfile, type LocationProfile } from "./production";
import { db, getProject, nextProjectTimestamp } from "./projects";
import { sceneText, type Project, type ScreenplayBlock, type TextBlock } from "./screenplay";

async function currentProject(id: string) {
  const project = await getProject(id);
  if (!project) throw new Error("ไม่พบโปรเจกต์นี้");
  return project;
}

async function changeBoard(projectId: string, change: (
  cards: BeatCard[], project: Project,
) => { cards: BeatCard[]; blocks?: ScreenplayBlock[] } | undefined) {
  await db.transaction("rw", db.projects, async () => {
    const project = await currentProject(projectId);
    const result = change(boardCards(project.blocks, project.beats), project);
    if (!result) return;

    const nextBlocks = result.blocks;
    await db.projects.update(projectId, {
      beats: result.cards,
      updatedAt: nextProjectTimestamp(project),
      ...(nextBlocks && nextBlocks !== project.blocks && {
        blocks: nextBlocks,
        editorRevision: (project.editorRevision ?? 0) + 1,
      }),
    });
  });
}

export function saveBeat(projectId: string, draft: BeatCard, isNew: boolean) {
  return changeBoard(projectId, (cards, project) => {
    const castIds = draft.castIds?.filter((id) => project.characters?.some((character) => character.id === id));
    const entry = { ...draft, castIds };
    if (isNew) return { cards: [...cards, entry] };
    const previous = cards.find(({ id }) => id === draft.id);
    if (!previous) throw new Error("ไม่พบการ์ดนี้");
    const updated = { ...entry, sceneId: previous.sceneId, scene: previous.sceneId ? previous.scene : entry.scene };
    return { cards: cards.map((card) => card.id === draft.id ? updated : card) };
  });
}

export function deleteBeat(projectId: string, id: string) {
  return changeBoard(projectId, (cards) => ({
    cards: cards.filter((card) => card.id !== id || card.sceneId),
  }));
}

export function moveBeat(projectId: string, sourceId: string, targetId: string) {
  return changeBoard(projectId, (cards, { blocks }) => {
    const from = cards.findIndex(({ id }) => id === sourceId);
    const to = cards.findIndex(({ id }) => id === targetId);
    if (from < 0 || to < 0 || from === to) return;
    const reordered = [...cards];
    const [card] = reordered.splice(from, 1);
    reordered.splice(to, 0, card);
    return { cards: reordered, blocks: orderScriptByBoard(blocks, reordered) };
  });
}

export function convertBeat(projectId: string, id: string) {
  return changeBoard(projectId, (cards, { blocks }) => {
    const card = cards.find((entry) => entry.id === id);
    if (!card || card.sceneId) return;
    const scene = { ...card.scene, location: card.scene.location.trim() || card.title.trim() };
    if (!scene.location) throw new Error("กรุณาระบุชื่อการ์ดหรือสถานที่");
    const heading: TextBlock = { id: card.id, kind: "sceneHeading", scene, text: sceneText(scene) };
    const linked = cards.map((entry) => entry.id === id ? { ...card, scene, sceneId: heading.id } : entry);
    return { cards: linked, blocks: orderScriptByBoard([...blocks, heading], linked) };
  });
}

export const maxReferenceImageBytes = 10 * 1024 * 1024;
export const referenceImageTypes = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"];

type ReferenceEdit =
  | { type: "characters"; profile: CharacterProfile }
  | { type: "locations"; profile: LocationProfile };

export function getReferenceImage(id: string) {
  return db.referenceImages.get(id);
}

export async function saveReference(projectId: string, edit: ReferenceEdit & {
  isNew: boolean;
  image?: Blob | null;
}) {
  const { image } = edit;
  const name = edit.profile.name.trim();
  if (!name) throw new Error("กรุณาระบุชื่อ");
  if (image && (!referenceImageTypes.includes(image.type) || image.size > maxReferenceImageBytes || image.size === 0)) {
    throw new Error("เลือกรูป JPG, PNG, WebP, GIF หรือ AVIF ขนาดไม่เกิน 10 MB");
  }

  await db.transaction("rw", db.projects, db.referenceImages, async () => {
    const project = await currentProject(projectId);
    const list = project[edit.type] ?? [];
    const { id } = edit.profile;
    const existing = list.find((record) => record.id === id);
    if (!edit.isNew && !existing) throw new Error("ข้อมูลนี้ถูกลบจากโปรเจกต์แล้ว");
    const key = nameKey(name);

    if (list.some((record) => record.id !== id &&
      [record.name, ...(record.aliases ?? [])].some((value) => nameKey(value) === key))) {
      throw new Error("ชื่อนี้มีอยู่ในโปรเจกต์แล้ว");
    }

    const aliases = new Map<string, string>();
    for (const alias of [...(existing?.aliases ?? []), existing?.name ?? ""]) {
      const normalized = nameKey(alias);
      if (normalized && normalized !== key) aliases.set(normalized, alias);
    }

    const imageId = image ? id : image === null ? undefined : existing?.imageId;
    if (image) await db.referenceImages.put({ id, projectId, blob: image });
    if (image === null && existing?.imageId) await db.referenceImages.delete(existing.imageId);

    const details = { name, aliases: [...aliases.values()], imageId };
    const update = edit.type === "characters"
      ? { characters: replaceRecord(project.characters ?? [], { ...edit.profile, ...details }) }
      : { locations: replaceRecord(project.locations ?? [], { ...edit.profile, ...details }) };
    await db.projects.update(projectId, { ...update, updatedAt: nextProjectTimestamp(project) });
  });
}

function replaceRecord<T extends { id: string }>(records: T[], updated: T) {
  return records.some(({ id }) => id === updated.id)
    ? records.map((record) => record.id === updated.id ? updated : record)
    : [...records, updated];
}

export async function deleteReference(projectId: string, type: ReferenceEdit["type"], id: string) {
  await db.transaction("rw", db.projects, db.referenceImages, async () => {
    const project = await currentProject(projectId);
    const reference = project[type]?.find((record) => record.id === id);
    if (!reference) return;

    if (reference.imageId) await db.referenceImages.delete(reference.imageId);
    const update = type === "characters"
      ? {
          characters: project.characters?.filter((record) => record.id !== id),
          beats: project.beats?.map((card) => card.castIds?.includes(id)
            ? { ...card, castIds: card.castIds.filter((castId) => castId !== id) }
            : card),
        }
      : { locations: project.locations?.filter((record) => record.id !== id) };
    await db.projects.update(projectId, { ...update, updatedAt: nextProjectTimestamp(project) });
  });
}
