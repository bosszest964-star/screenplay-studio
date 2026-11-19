import { z } from "zod";
import { db, type ReferenceImage } from "../projects";
import type { Project } from "../screenplay";

const id = z.string().min(1).max(100);
const text = z.string();
const time = z.enum(["DAY", "NIGHT", "DAWN", "CONTINUOUS"]);
const scene = z.object({ setting: z.enum(["INT.", "EXT."]), location: text, time });
const block = z.union([
  z.object({
    id, kind: z.enum(["sceneHeading", "action", "character", "parenthetical", "dialogue", "transition"]),
    text, scene: scene.optional(), visual: text.optional(), audio: text.optional(),
  }),
  z.object({ id, kind: z.literal("audioVisual"), visual: text, audio: text }),
]);
const speedKind = z.enum(["dialogue", "parenthetical", "action"]);
const reference = z.object({ id, name: text, aliases: z.array(text).optional(), imageId: id.optional() });
const projectSchema = z.object({
  id, name: text.min(1).max(100), format: z.enum(["international", "thai", "two-column"]),
  blocks: z.array(block), dialogueQuotes: z.boolean().optional(),
  speedSession: z.object({
    afterBlockId: id.nullable(), entries: z.array(z.object({ id, kind: speedKind, character: text, text })),
    characters: z.array(text), character: text, kind: speedKind, text,
  }).nullish(),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
  cover: z.enum(["last-light", "rain", "mountains"]).optional(),
  beats: z.array(z.object({
    id, title: text, notes: text, color: z.enum(["sand", "lilac", "pink", "mint", "blue"]),
    scene, sceneId: id.optional(), castIds: z.array(id).optional(),
  })).optional(),
  characters: z.array(reference.extend({ age: z.number().int().nonnegative().optional(), personality: text, backstory: text })).optional(),
  locations: z.array(reference.extend({ description: text, lighting: text })).optional(),
}) satisfies z.ZodType<Project>;

export const driveSnapshot = z.object({
  schema: z.literal(1),
  project: projectSchema,
  images: z.array(z.object({
    id, fileId: id, hash: z.string().regex(/^[0-9a-f]{64}$/),
    type: z.enum(["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"]),
  })),
});

export interface Snapshot {
  project: Project;
  images: ReferenceImage[];
}

export const deletedHash = "deleted";

type Content = Omit<Project, "updatedAt" | "createdAt" | "editorRevision">;

function contentOf({ updatedAt, createdAt, editorRevision, speedSession, ...project }: Project): Content {
  return { ...project, speedSession: speedSession ?? null };
}

function stableJson(value: unknown) {
  return JSON.stringify(value, (_, item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return item;
    return Object.fromEntries(Object.keys(item).sort().map((key) => [key, item[key]]));
  });
}

export async function sha256(source: ArrayBuffer) {
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", source)),
    (value) => value.toString(16).padStart(2, "0")).join("");
}

export function hashText(value: string) {
  return sha256(new TextEncoder().encode(value).buffer);
}

export async function fingerprint(snapshot: Snapshot) {
  const images = await Promise.all(snapshot.images.map(async (image) => ({
    ...image, hash: await sha256(await image.blob.arrayBuffer()),
  })));
  const identity = images.map(({ id, hash, blob }) => ({ id, hash, type: blob.type })).sort((a, b) => a.id.localeCompare(b.id));
  const hash = await hashText(stableJson([contentOf(snapshot.project), identity]));
  return { hash, images };
}

export function readSnapshot(projectId: string) {
  return db.transaction("r", db.projects, db.referenceImages, async () => {
    const project = await db.projects.get(projectId);
    if (!project) return undefined;
    const images = await db.referenceImages.where("projectId").equals(projectId).toArray();
    return { project, images };
  });
}

const sampleContent: Record<string, Pick<Project, "name" | "cover" | "format">> = {
  "sample-last-light": { name: "The Last Light", cover: "last-light", format: "international" },
  "sample-rain": { name: "เงาในคืนฝน", cover: "rain", format: "thai" },
  "sample-mountains": { name: "Before the Mountains", cover: "mountains", format: "two-column" },
};

export function pristineSample(project: Project) {
  const sample = sampleContent[project.id];
  return sample && project.name === sample.name && project.cover === sample.cover && project.format === sample.format &&
    !project.blocks.length && !project.beats?.length && !project.locations?.length && !project.characters?.length &&
    !project.speedSession && project.dialogueQuotes === undefined;
}

export function conflictSnapshot(snapshot: Snapshot, id: string): Snapshot {
  const source = snapshot.project;
  // Remap profile and photo IDs together. Their keys are shared by the reference editor.
  const mapped = new Map<string, string>();
  const remap = (value: string) => {
    const existing = mapped.get(value);
    if (existing) return existing;
    const next = `${id}-${mapped.size + 1}`;
    mapped.set(value, next);
    return next;
  };
  const reference = <T extends { id: string; imageId?: string }>(entry: T) => ({
    ...entry, id: remap(entry.id), imageId: entry.imageId ? remap(entry.imageId) : undefined,
  });
  const name = source.name.slice(0, 80) + " (ฉบับขัดแย้ง)";
  return {
    project: {
      ...source, id, name, editorRevision: 0, updatedAt: Date.now(),
      characters: source.characters?.map(reference),
      locations: source.locations?.map(reference),
      beats: source.beats?.map((card) => ({ ...card, castIds: card.castIds?.map(remap) })),
    },
    images: snapshot.images.map((image) => ({ ...image, id: remap(image.id), projectId: id })),
  };
}
