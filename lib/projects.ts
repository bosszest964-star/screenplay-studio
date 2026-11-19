import Dexie, { type EntityTable, type Table } from "dexie";
import type { EditorDraft, Project } from "./screenplay";

interface WorkspaceSetting {
  key: string;
  value: boolean;
}

export interface ReferenceImage {
  id: string;
  projectId: string;
  blob: Blob;
}

export interface CloudBookmark {
  accountId: string;
  projectId: string;
  remoteId: string;
  hash: string;
  localVersion?: number;
}

interface CloudConnection {
  id: "google";
  accountId: string;
  email?: string;
}

export const db = new Dexie("sceneform-workspace") as Dexie & {
  projects: EntityTable<Project, "id">;
  settings: EntityTable<WorkspaceSetting, "key">;
  referenceImages: EntityTable<ReferenceImage, "id">;
  cloudBookmarks: Table<CloudBookmark, [string, string]>;
  cloudConnection: EntityTable<CloudConnection, "id">;
};

db.version(1).stores({
  projects: "id, updatedAt",
  settings: "key",
});

db.version(2).stores({ referenceImages: "id, projectId" });
db.version(3).stores({
  cloudBookmarks: "[accountId+projectId], accountId",
  cloudConnection: "id",
});

export function nextProjectTimestamp(project: Pick<Project, "updatedAt">) {
  return Math.max(Date.now(), project.updatedAt + 1);
}

export const projectNameLimit = 100;

function normalizeName(name: string) {
  const trimmed = name.trim();
  if (!trimmed || trimmed.length > projectNameLimit) {
    throw new Error("ชื่อโปรเจกต์ต้องมีความยาว 1–100 ตัวอักษร");
  }
  return trimmed;
}

export async function initializeWorkspace() {
  await db.transaction("rw", db.projects, db.settings, async () => {
    if (await db.settings.get("initialized")) return;

    if ((await db.projects.count()) === 0) {
      const now = Date.now();
      const day = 86_400_000;
      await db.projects.bulkAdd([
        {
          id: "sample-last-light",
          name: "The Last Light",
          format: "international",
          blocks: [],
          cover: "last-light",
          createdAt: now - 7 * day,
          updatedAt: now,
        },
        {
          id: "sample-rain",
          name: "เงาในคืนฝน",
          format: "thai",
          blocks: [],
          cover: "rain",
          createdAt: now - 9 * day,
          updatedAt: now - 2 * day,
        },
        {
          id: "sample-mountains",
          name: "Before the Mountains",
          format: "two-column",
          blocks: [],
          cover: "mountains",
          createdAt: now - 12 * day,
          updatedAt: now - 4 * day,
        },
      ]);
    }

    await db.settings.add({ key: "initialized", value: true });
  });
}

export function listProjects() {
  return db.projects.orderBy("updatedAt").reverse().toArray();
}

export async function createProject(name: string) {
  const now = Date.now();
  const project: Project = {
    id: crypto.randomUUID(),
    name: normalizeName(name),
    format: "international",
    blocks: [],
    createdAt: now,
    updatedAt: now,
  };

  await db.projects.add(project);
  return project;
}

export async function renameProject(id: string, name: string) {
  const normalized = normalizeName(name);
  await db.transaction("rw", db.projects, async () => {
    const project = await db.projects.get(id);
    if (!project) throw new Error("ไม่พบโปรเจกต์นี้");
    await db.projects.update(id, { name: normalized, updatedAt: nextProjectTimestamp(project) });
  });
}

export async function deleteProject(id: string) {
  await db.transaction("rw", db.projects, db.referenceImages, async () => {
    await db.referenceImages.where("projectId").equals(id).delete();
    await db.projects.delete(id);
  });
}

export function getProject(id: string) {
  return db.projects.get(id);
}

export class DraftConflict extends Error {}

export async function saveProjectDraft(id: string, revision: number, draft: EditorDraft) {
  return db.transaction("rw", db.projects, async () => {
    const project = await db.projects.get(id);
    if (!project || (project.editorRevision ?? 0) !== revision) throw new DraftConflict();
    const nextRevision = revision + 1;
    await db.projects.update(id, {
      ...draft,
      editorRevision: nextRevision,
      updatedAt: nextProjectTimestamp(project),
    });
    return nextRevision;
  });
}
