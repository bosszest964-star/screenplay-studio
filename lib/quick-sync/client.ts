import type { ExportScript } from "../export/representation";
import { maxRelayBytes, type SyncLink } from "./link";

export interface Revision {
  id: string;
  projectId: string;
  hash: string;
  parent?: string;
  createdTime: string;
}

export class QuickSyncClient {
  constructor(private readonly link: SyncLink) {}

  async request<T>(operation: string, payload?: object): Promise<T> {
    const body = JSON.stringify({ ...this.link, operation, payload });
    if (new TextEncoder().encode(body).byteLength > maxRelayBytes) {
      throw new Error("โปรเจกต์หรือบทใหญ่เกินขนาดที่ซิงค์ได้ ใช้ไฟล์สำรองเพื่อย้ายข้อมูล");
    }
    const response = await fetch("/api/quick-sync", {
      method: "POST", headers: { "Content-Type": "application/json" }, body,
      cache: "no-store", signal: AbortSignal.timeout(30_000),
    });
    if (!response.headers.get("Content-Type")?.includes("application/json")) throw new Error("แอปติดต่อบริการ Quick Sync ไม่สำเร็จ");
    const result = await response.json() as { ok?: boolean; value?: T; error?: string };
    if (!response.ok || result.ok !== true) throw new Error(result.error || "เชื่อมต่อ Apps Script ไม่สำเร็จ");
    return result.value as T;
  }

  async verify() {
    const info = await this.request<{ version: number }>("ping");
    if (info?.version !== 1) throw new Error("Web App นี้ไม่รองรับ Quick Sync");
  }

  async exportDocs(projectId: string, script: ExportScript) {
    const url = await this.request<string>("docs", { projectId, script });
    if (typeof url !== "string" || !/^https:\/\/docs\.google\.com\/document\/d\/[a-zA-Z0-9_-]+\/edit$/.test(url)) {
      throw new Error("ไม่ได้รับลิงก์ Google Docs ที่ถูกต้อง");
    }
    return url;
  }
}

export function encodeBytes(bytes: Uint8Array) {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 8192) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 8192));
  }
  return btoa(binary);
}

export function decodeBytes(value: string) {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}
