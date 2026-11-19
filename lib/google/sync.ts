import { db, nextProjectTimestamp, type CloudBookmark } from "../projects";
import { GoogleDrive, GoogleRequestError, driveProperty, googleSession, type DriveFile } from "./drive";
import {
  conflictSnapshot, deletedHash, driveSnapshot, fingerprint, hashText, pristineSample, readSnapshot, sha256, type Snapshot,
} from "./snapshot";

export const backgroundSyncTag = "sceneform-google-drive";
const imageLimit = 10 * 1024 * 1024;
const fileExtensions: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif", "image/avif": "avif",
};

interface Revision {
  id: string;
  projectId: string;
  hash: string;
  parent?: string;
  createdTime: string;
}

function revisions(files: DriveFile[]) {
  const grouped = new Map<string, Revision[]>();
  for (const file of files) {
    const meta = file.appProperties;
    if (!meta?.ssProject || !meta.ssHash || (meta.ssHash !== deletedHash && !/^[0-9a-f]{64}$/.test(meta.ssHash))) continue;
    const list = grouped.get(meta.ssProject) ?? [];
    list.push({ id: file.id, projectId: meta.ssProject, parent: meta.ssParent, hash: meta.ssHash, createdTime: file.createdTime });
    grouped.set(meta.ssProject, list);
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

async function downloadSnapshot(drive: GoogleDrive, revision: Revision): Promise<Snapshot | undefined> {
  if (revision.hash === deletedHash) return undefined;
  const response = await drive.download(revision.id);
  const snapshot = driveSnapshot.parse(await response.json());
  const project = snapshot.project;
  if (project.id !== revision.projectId) throw new Error("ไฟล์บน Drive มีรหัสโปรเจกต์ไม่ตรงกัน");
  const references = [...project.characters ?? [], ...project.locations ?? []]
    .flatMap(({ imageId }) => imageId ? [imageId] : []);
  const imageIds = new Set(snapshot.images.map((image) => image.id));
  if (imageIds.size !== snapshot.images.length || imageIds.size !== new Set(references).size ||
      references.some((value) => !imageIds.has(value))) throw new Error("ไฟล์รูปอ้างอิงบน Drive ไม่ครบ");

  const images = await Promise.all(snapshot.images.map(async ({ id, fileId, hash, type }) => {
    const file = await drive.download(fileId);
    const data = await file.arrayBuffer();
    if (data.byteLength === 0 || data.byteLength > imageLimit || await sha256(data) !== hash) {
      throw new Error("ไฟล์รูปอ้างอิงบน Drive ไม่ตรงกับข้อมูลที่บันทึกไว้");
    }
    return { id, projectId: project.id, blob: new Blob([data], { type }) };
  }));
  const verified = await fingerprint({ project, images });
  if (verified.hash !== revision.hash) throw new Error("ข้อมูลโปรเจกต์บน Drive ไม่ตรงกับฉบับที่บันทึกไว้");
  return { project, images };
}

async function uploadRevision(
  drive: GoogleDrive, root: string, projectId: string, parent: Revision | undefined,
  local: Snapshot | undefined, digest?: Awaited<ReturnType<typeof fingerprint>>,
) {
  const folder = await drive.projectFolder(root, local?.project ?? { id: projectId, name: "โปรเจกต์" });
  const hash = digest?.hash ?? deletedHash;
  const properties = { ssType: "snapshot", ssProject: projectId, ssHash: hash, ...(parent && { ssParent: parent.id }) };
  const store = async (data: unknown) => {
    const stamp = new Date().toISOString().replace(/:/g, "-");
    return drive.upload(`project-${stamp}-${hash.slice(0, 8)}.json`,
      new Blob([JSON.stringify(data)], { type: "application/json" }), folder.id, properties);
  };

  if (!local || !digest) return store({ schema: 1, deleted: true });
  const files = digest.images.length
    ? await drive.list(`'${folder.id}' in parents and ${driveProperty("ssType", "image")}`)
    : [];
  const existing = new Map(files.map((file) => [file.appProperties?.ssHash, file.id]));
  const images = [];
  for (const { id, hash, blob } of digest.images) {
    let fileId = existing.get(hash);
    if (!fileId) {
      const file = await drive.upload(`reference-${hash.slice(0, 20)}.${fileExtensions[blob.type]}`, blob, folder.id, { ssType: "image", ssHash: hash });
      fileId = file.id;
      existing.set(hash, fileId);
    }
    images.push({ id, hash, fileId, type: blob.type });
  }
  return store({ schema: 1, project: local.project, images });
}

async function writeSnapshot(snapshot: Snapshot) {
  const id = snapshot.project.id;
  for (const image of snapshot.images) {
    const previous = await db.referenceImages.get(image.id);
    if (previous && previous.projectId !== id) throw new Error("รหัสรูปอ้างอิงซ้ำกับโปรเจกต์อื่น");
  }
  await db.projects.put(snapshot.project);
  await db.referenceImages.where("projectId").equals(id).delete();
  await db.referenceImages.bulkPut(snapshot.images);
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
  drive: GoogleDrive, root: string, accountId: string, id: string, remote?: Revision, bookmark?: CloudBookmark,
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
    const file = await uploadRevision(drive, root, id, remote, local, digest);
    await mark(accountId, id, file.id, digest?.hash ?? deletedHash, local?.project.updatedAt);
    return false;
  }

  const keepLocal = !!local && digest?.hash !== bookmark?.hash && !pristineSample(local.project);
  return applyRemote(accountId, remote, await downloadSnapshot(drive, remote), local, keepLocal);
}

async function preserveRemoteTip(drive: GoogleDrive, tip: Revision, known: Map<string, Revision[]>) {
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

async function synchronize(drive: GoogleDrive, accountId: string) {
  const [root, remoteFiles, bookmarks, localIds] = await Promise.all([
    drive.workspace(), drive.list(driveProperty("ssType", "snapshot")),
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
      conflicts += Number(await synchronizeProject(drive, root.id, accountId, id, tip, observed.get(id)));
      const seen = new Set([tip?.hash, deletedHash]);
      for (const other of otherTips) {
        if (seen.has(other.hash)) continue;
        seen.add(other.hash);
        conflicts += Number(await preserveRemoteTip(drive, other, remote));
      }
    } catch (error) {
      if (error instanceof GoogleRequestError && (error.status === 401 || error.status === 429)) throw error;
      failure ??= error;
    }
  }
  if (failure) throw failure;
  return conflicts;
}

export async function synchronizeGoogleDrive() {
  const run = async () => {
    for (const refresh of [false, true]) {
      const session = await googleSession(refresh);
      if (!session.accessToken) return { configured: session.configured, connected: false as const };
      const drive = new GoogleDrive(session.accessToken);
      try {
        const { accountId, email } = await drive.account();
        await db.cloudConnection.put({ id: "google", accountId, email });
        return { configured: true, connected: true as const, email, conflicts: await synchronize(drive, accountId) };
      } catch (error) {
        if (!refresh && error instanceof GoogleRequestError && error.status === 401) continue;
        throw error;
      }
    }
    throw new Error("ไม่สามารถเชื่อมต่อ Google Drive ได้");
  };

  return navigator.locks ? navigator.locks.request(backgroundSyncTag, run) : run();
}
