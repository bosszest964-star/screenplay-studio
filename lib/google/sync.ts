import { db, nextProjectTimestamp, type CloudBookmark } from "../projects";
import { decodeBytes, encodeBytes, QuickSyncClient, type Revision } from "../quick-sync/client";
import { pristineSample } from "../samples";
import {
  conflictSnapshot, deletedHash, driveSnapshot, fingerprint, hashText, readSnapshot, sha256,
  validateImageIds, writeSnapshot, type Snapshot,
} from "./snapshot";

export const backgroundSyncTag = "sceneform-quick-sync";
const imageLimit = 10 * 1024 * 1024;
const partBytes = 768 * 1024;

function revisions(files: Revision[]) {
  const grouped = new Map<string, Revision[]>();
  for (const file of files) {
    if (!file.projectId || !file.hash || (file.hash !== deletedHash && !/^[0-9a-f]{64}$/.test(file.hash))) continue;
    const list = grouped.get(file.projectId) ?? [];
    list.push(file);
    grouped.set(file.projectId, list);
  }

  for (const [projectId, list] of grouped) {
    const ancestors = new Set(list.map(({ parent }) => parent));
    const tips = list.filter((entry) => !ancestors.has(entry.id));
    tips.sort((a, b) => b.createdTime.localeCompare(a.createdTime) || b.id.localeCompare(a.id));
    if (tips.length) grouped.set(projectId, tips);
    else grouped.delete(projectId);
  }
  return grouped;
}

async function downloadSnapshot(drive: QuickSyncClient, revision: Revision): Promise<Snapshot | undefined> {
  if (revision.hash === deletedHash) return undefined;
  const snapshot = driveSnapshot.parse(await drive.request("snapshot", { projectId: revision.projectId, id: revision.id }));
  const project = snapshot.project;
  if (project.id !== revision.projectId) throw new Error("ไฟล์บน Drive มีรหัสโปรเจกต์ไม่ตรงกัน");
  validateImageIds(project, snapshot.images.map(({ id }) => id));

  const images = [];
  for (const { id, parts, hash, type } of snapshot.images) {
    const chunks: Uint8Array<ArrayBuffer>[] = [];
    for (let index = 0; index < parts; index++) {
      const chunk = decodeBytes(await drive.request<string>("getAsset", { projectId: project.id, hash, index }));
      if (chunk.byteLength === 0 || chunk.byteLength > partBytes) throw new Error("ไฟล์รูปอ้างอิงบน Drive เสียหาย");
      chunks.push(chunk);
    }
    const blob = new Blob(chunks, { type });
    if (blob.size > imageLimit || await sha256(await blob.arrayBuffer()) !== hash) {
      throw new Error("ไฟล์รูปอ้างอิงบน Drive ไม่ตรงกับข้อมูลที่บันทึกไว้");
    }
    images.push({ id, projectId: project.id, blob });
  }
  const verified = await fingerprint({ project, images });
  if (verified.hash !== revision.hash) throw new Error("ข้อมูลโปรเจกต์บน Drive ไม่ตรงกับฉบับที่บันทึกไว้");
  return { project, images };
}

async function uploadRevision(
  drive: QuickSyncClient, projectId: string, parent: Revision | undefined,
  local: Snapshot | undefined, digest?: Awaited<ReturnType<typeof fingerprint>>,
) {
  const hash = digest?.hash ?? deletedHash;
  const id = (await hashText(JSON.stringify([projectId, parent?.id, hash]))).slice(0, 48);
  const images = [];
  const existing = new Set(digest?.images.length ? await drive.request<string[]>("assets", { projectId }) : []);
  for (const image of digest?.images ?? []) {
    const parts = Math.ceil(image.blob.size / partBytes);
    for (let index = 0; index < parts; index++) {
      const token = `asset-${image.hash}-${index}`;
      if (existing.has(token)) continue;
      const bytes = new Uint8Array(await image.blob.slice(index * partBytes, (index + 1) * partBytes).arrayBuffer());
      await drive.request("putAsset", { projectId, hash: image.hash, index, base64: encodeBytes(bytes) });
      existing.add(token);
    }
    images.push({ id: image.id, hash: image.hash, type: image.blob.type, parts });
  }
  return drive.request<Revision>("publish", {
    id, projectId, hash, parent: parent?.id,
    snapshot: local ? { schema: 1, project: local.project, images } : undefined,
  });
}

function mark(accountId: string, projectId: string, remoteId: string, hash: string, localVersion?: number) {
  return db.cloudBookmarks.put({ accountId, projectId, remoteId, hash, localVersion });
}

async function applyRemote(
  accountId: string, revision: Revision, remote: Snapshot | undefined, local: Snapshot | undefined, keepLocal: boolean,
) {
  const id = revision.projectId;
  const localCopy = local && keepLocal ? conflictSnapshot(local, crypto.randomUUID()) : undefined;
  return db.transaction("rw", db.projects, db.referenceImages, db.cloudBookmarks, async () => {
    const current = await db.projects.get(id);
    // A Drive download may finish after another tab saves a newer edit.
    if (current?.updatedAt !== local?.project.updatedAt) return false;

    if (localCopy) await writeSnapshot(localCopy);
    if (remote) {
      remote.project.updatedAt = current ? nextProjectTimestamp(current) : Date.now();
      remote.project.editorRevision = (current?.editorRevision ?? 0) + 1;
      await writeSnapshot(remote);
    } else if (current) {
      await db.projects.delete(id);
      await db.referenceImages.where("projectId").equals(id).delete();
    }
    await mark(accountId, id, revision.id, revision.hash, remote?.project.updatedAt);
    return Boolean(localCopy);
  });
}

async function synchronizeProject(
  drive: QuickSyncClient, accountId: string, id: string, remote?: Revision, bookmark?: CloudBookmark,
) {
  const head = await db.projects.get(id);
  if (remote && bookmark?.remoteId === remote.id && head?.updatedAt === bookmark.localVersion) return false;
  if (!remote && (!head || pristineSample(head))) return false;

  const local = await readSnapshot(id);
  if (!local && remote?.hash === deletedHash) {
    await mark(accountId, id, remote.id, deletedHash);
    return false;
  }

  const digest = local ? await fingerprint(local) : undefined;
  if (remote && digest?.hash === remote.hash) {
    await mark(accountId, id, remote.id, remote.hash, local?.project.updatedAt);
    return false;
  }

  if (!remote || (bookmark && remote.hash === bookmark.hash)) {
    if (!remote && !local) return false;
    const file = await uploadRevision(drive, id, remote, local, digest);
    await mark(accountId, id, file.id, digest?.hash ?? deletedHash, local?.project.updatedAt);
    return false;
  }

  const keepLocal = !!local && digest?.hash !== bookmark?.hash && !pristineSample(local.project);
  return applyRemote(accountId, remote, await downloadSnapshot(drive, remote), local, keepLocal);
}

async function preserveRemoteTip(drive: QuickSyncClient, tip: Revision, known: Map<string, Revision[]>) {
  const copyId = "conflict-" + (await hashText(tip.id)).slice(0, 32);
  if (known.has(copyId) || await db.projects.get(copyId)) return false;
  const remote = await downloadSnapshot(drive, tip);
  if (!remote) return false;
  const copy = conflictSnapshot(remote, copyId);
  return db.transaction("rw", db.projects, db.referenceImages, async () => {
    if (await db.projects.get(copyId)) return false;
    await writeSnapshot(copy);
    return true;
  });
}

async function synchronize(drive: QuickSyncClient, accountId: string) {
  const [remoteFiles, bookmarks, localIds] = await Promise.all([
    drive.request<Revision[]>("list"),
    db.cloudBookmarks.where("accountId").equals(accountId).toArray(), db.projects.toCollection().primaryKeys(),
  ]);
  const remote = revisions(remoteFiles);
  const observed = new Map(bookmarks.map((entry) => [entry.projectId, entry]));
  const ids = new Set([...localIds, ...remote.keys()]);
  let conflicts = 0;
  let failure: unknown;

  for (const id of ids) {
    const [tip, ...otherTips] = remote.get(id) ?? [];
    try {
      conflicts += Number(await synchronizeProject(drive, accountId, id, tip, observed.get(id)));
      const seen = new Set([tip?.hash, deletedHash]);
      for (const other of otherTips) {
        if (seen.has(other.hash)) continue;
        seen.add(other.hash);
        conflicts += Number(await preserveRemoteTip(drive, other, remote));
      }
    } catch (error) {
      failure ??= error;
    }
  }
  if (failure) throw failure;
  return conflicts;
}

export async function synchronizeQuickSync() {
  const run = async () => {
    const connection = await db.quickSync.get("workspace");
    if (!connection) return 0;
    const accountId = "quick-" + await hashText(connection.endpoint);
    return synchronize(new QuickSyncClient(connection), accountId);
  };

  return navigator.locks ? navigator.locks.request(backgroundSyncTag, run) : run();
}
