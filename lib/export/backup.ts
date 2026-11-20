import { z } from "zod";
import { conflictSnapshot, projectSchema, readSnapshot, validateImageIds, writeSnapshot, type Snapshot } from "../google/snapshot";
import { db } from "../projects";
import { decodeBytes, encodeBytes } from "../quick-sync/client";
import type { Project } from "../screenplay";

const maxImageBytes = 10 * 1024 * 1024;
const maxBackupBytes = 128 * 1024 * 1024;
const backup = z.object({
  kind: z.literal("sceneform-project"),
  version: z.literal(1),
  project: projectSchema,
  images: z.array(z.object({
    id: z.string().min(1).max(100),
    type: z.enum(["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"]),
    base64: z.string().max(Math.ceil(maxImageBytes / 3) * 4),
  })),
});

export async function downloadBackup(project: Project) {
  const local = await readSnapshot(project.id);
  if (!local) throw new Error("ไม่พบโปรเจกต์ที่ต้องการสำรอง");
  const images = await Promise.all(local.images.map(async ({ id, blob }) => ({
    id, type: blob.type, base64: encodeBytes(new Uint8Array(await blob.arrayBuffer())),
  })));
  const packet = backup.parse({ kind: "sceneform-project", version: 1, project, images });
  validateImageIds(project, images.map(({ id }) => id));
  const file = new Blob([JSON.stringify(packet)], { type: "application/json" });
  if (file.size > maxBackupBytes) throw new Error("ไฟล์สำรองมีขนาดเกิน 128 MB");
  const link = document.createElement("a");
  link.href = URL.createObjectURL(file);
  link.download = (project.name.replace(/[\\/:*?"<>|\r\n]/g, "_").trim() || "screenplay") + ".sceneform.json";
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(link.href), 30_000);
}

export async function restoreBackup(file: File) {
  if (file.size > maxBackupBytes) throw new Error("ไฟล์สำรองมีขนาดเกิน 128 MB");
  let source: Snapshot;
  try {
    const packet = backup.parse(JSON.parse(await file.text()));
    const { project } = packet;
    validateImageIds(project, packet.images.map(({ id }) => id));
    const images = packet.images.map(({ id, type, base64 }) => {
      const bytes = decodeBytes(base64);
      if (!bytes.length || bytes.length > maxImageBytes) throw new Error("Invalid image");
      return { id, projectId: project.id, blob: new Blob([bytes], { type }) };
    });
    source = { project: { ...project, updatedAt: Date.now(), editorRevision: 0 }, images };
  } catch {
    throw new Error("เปิดไฟล์สำรอง Sceneform ไม่สำเร็จ ตรวจว่าเลือกไฟล์ .sceneform.json ที่สมบูรณ์");
  }

  return db.transaction("rw", db.projects, db.referenceImages, async () => {
    const existing = await db.projects.get(source.project.id);
    const images = await db.referenceImages.bulkGet(source.images.map(({ id }) => id));
    const restored = existing || images.some(Boolean) ? conflictSnapshot(source, crypto.randomUUID(), "สำเนา") : source;
    await writeSnapshot(restored);
    return restored.project;
  });
}
