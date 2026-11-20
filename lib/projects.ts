import Dexie, { type EntityTable, type Table, type Transaction } from "dexie";
import { isLegacySample, sampleDataVersion, sampleProjects, sampleSignature } from "./samples";
import type { EditorDraft, Project } from "./screenplay";

interface WorkspaceSetting {
  key: string;
  value: boolean | number | string;
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

export interface QuickSyncConnection {
  id: "workspace";
  endpoint: string;
  key: string;
}

export const db = new Dexie("sceneform-workspace") as Dexie & {
  projects: EntityTable<Project, "id">;
  settings: EntityTable<WorkspaceSetting, "key">;
  referenceImages: EntityTable<ReferenceImage, "id">;
  cloudBookmarks: Table<CloudBookmark, [string, string]>;
  quickSync: EntityTable<QuickSyncConnection, "id">;
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

db.version(4).stores({ quickSync: "id", cloudConnection: null });
db.version(5).stores({}).upgrade((transaction) => applySampleData(transaction));
db.on("populate", (transaction) => applySampleData(transaction));

const sampleVersionKey = "sample-data-version";

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

async function applySampleData(transaction: Transaction, reset = false) {
  const projects = transaction.table<Project, string>("projects");
  const settings = transaction.table<WorkspaceSetting, string>("settings");
  const images = transaction.table<ReferenceImage, string>("referenceImages");
  const version = (await settings.get(sampleVersionKey))?.value;
  if (!reset && typeof version === "number" && version >= sampleDataVersion) return;

  const initialized = (await settings.get("initialized"))?.value === true;
  const now = Date.now();
  const day = 86_400_000;
  for (const [index, sample] of sampleProjects.entries()) {
    const current = await projects.get(sample.id);
    const baselineKey = `sample-baseline-${sample.id}`;
    const nextBaseline = sampleSignature(sample);

    if (!reset && current) {
      const signature = sampleSignature(current);
      if (signature === nextBaseline) {
        await settings.put({ key: baselineKey, value: nextBaseline });
        continue;
      }
      const previousBaseline = (await settings.get(baselineKey))?.value;
      // Upgrade only starter content that still matches its previous baseline.
      if (!(signature === previousBaseline || isLegacySample(current)) ||
          await images.where("projectId").equals(sample.id).count()) continue;
    } else if (!reset && initialized) {
      continue;
    }

    if (reset) await images.where("projectId").equals(sample.id).delete();
    await projects.put({
      ...sample,
      createdAt: current?.createdAt ?? now - (7 + index * 2) * day,
      updatedAt: current ? nextProjectTimestamp(current) : now - (reset ? index : index * 2 * day),
      editorRevision: current ? (current.editorRevision ?? 0) + 1 : reset ? now : 0,
    });
    await settings.put({ key: baselineKey, value: nextBaseline });
  }
  await settings.bulkPut([
    { key: "initialized", value: true },
    { key: sampleVersionKey, value: sampleDataVersion },
  ]);
}

export function initializeWorkspace() {
  return db.transaction("rw", db.projects, db.settings, db.referenceImages, (transaction) => applySampleData(transaction));
}

export function resetSampleProjects() {
  return db.transaction("rw", db.projects, db.settings, db.referenceImages, (transaction) => applySampleData(transaction, true));
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
