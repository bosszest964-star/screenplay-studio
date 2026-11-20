"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { db } from "@/lib/projects";
import { backgroundSyncTag, synchronizeQuickSync } from "@/lib/google/sync";
import { QuickSyncClient } from "@/lib/quick-sync/client";
import type { SyncLink } from "@/lib/quick-sync/link";

type SyncStatus = "disconnected" | "syncing" | "synced" | "offline" | "error";
const syncLabels: Record<SyncStatus, string> = {
  disconnected: "ยังไม่ได้เชื่อมต่อ", syncing: "กำลังซิงค์", synced: "ซิงค์แล้ว", offline: "ออฟไลน์", error: "ซิงค์ไม่สำเร็จ",
};
type GoogleContextValue = {
  status: SyncStatus;
  label: string;
  connected: boolean;
  connection?: SyncLink;
  online: boolean;
  message: string;
  sync: () => Promise<void>;
  connect: (link: SyncLink) => Promise<void>;
  disconnect: () => Promise<void>;
};
const GoogleContext = createContext<GoogleContextValue | null>(null);

async function queueBackgroundSync() {
  const worker = navigator.serviceWorker;
  if (!worker?.controller) return;
  try {
    const registration = await worker.ready as ServiceWorkerRegistration & { sync?: { register(tag: string): Promise<void> } };
    await registration.sync?.register(backgroundSyncTag);
  } catch {}
}

export function GoogleProvider({ children }: { children: ReactNode }) {
  const [online, setOnline] = useState(true);
  const [status, setStatus] = useState<SyncStatus>("disconnected");
  const [message, setMessage] = useState("");
  const pending = useRef<Promise<void> | null>(null);
  const rerun = useRef(false);
  const disconnecting = useRef(false);
  const connection = useLiveQuery(() => db.quickSync.get("workspace").catch(() => undefined), []);
  const changes = useLiveQuery(() => db.projects.orderBy("updatedAt").keys().catch(() => []), []);

  const sync = useCallback(function run(): Promise<void> {
    if (disconnecting.current) return Promise.resolve();
    if (!navigator.onLine) {
      void queueBackgroundSync();
      return Promise.resolve();
    }
    if (pending.current) {
      rerun.current = true;
      return pending.current;
    }
    setStatus("syncing");
    setMessage("");
    const task = (async () => {
      try {
        const conflicts = await synchronizeQuickSync();
        setStatus("synced");
        if (conflicts) setMessage(`เก็บฉบับขัดแย้งเป็นโปรเจกต์แยก ${conflicts} รายการแล้ว`);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "ซิงค์ไม่สำเร็จ ข้อมูลยังบันทึกอยู่ในเครื่อง");
        setStatus("error");
      } finally {
        pending.current = null;
        if (rerun.current && !disconnecting.current) {
          rerun.current = false;
          void run();
        }
      }
    })();
    pending.current = task;
    return task;
  }, []);

  useEffect(() => {
    const network = () => setOnline(navigator.onLine);
    network();
    window.addEventListener("online", network);
    window.addEventListener("offline", network);
    return () => {
      window.removeEventListener("online", network);
      window.removeEventListener("offline", network);
    };
  }, []);

  useEffect(() => {
    if (!connection) return;
    if (!online) {
      void queueBackgroundSync();
      return;
    }
    const timer = window.setTimeout(() => void sync(), 1_700);
    return () => window.clearTimeout(timer);
  }, [changes, online, connection?.endpoint, connection?.key, sync]);

  useEffect(() => {
    if (!connection || !online) return;
    const refresh = () => {
      if (document.visibilityState === "visible") void sync();
    };
    document.addEventListener("visibilitychange", refresh);
    const timer = window.setInterval(refresh, 45_000);
    return () => {
      document.removeEventListener("visibilitychange", refresh);
      window.clearInterval(timer);
    };
  }, [online, connection?.endpoint, connection?.key, sync]);

  async function connect(link: SyncLink) {
    await new QuickSyncClient(link).verify();
    await db.quickSync.put({ ...link, id: "workspace" });
    void sync();
  }

  async function disconnect() {
    disconnecting.current = true;
    rerun.current = false;
    try {
      await pending.current;
      const remove = () => db.quickSync.delete("workspace");
      if (navigator.locks) await navigator.locks.request(backgroundSyncTag, remove);
      else await remove();
      setStatus("disconnected");
      setMessage("");
    } finally {
      disconnecting.current = false;
    }
  }

  const visibleStatus = !connection ? "disconnected" : !online ? "offline" : status === "disconnected" ? "syncing" : status;
  return <GoogleContext.Provider value={{
    status: visibleStatus, label: syncLabels[visibleStatus], connected: !!connection, connection, online, message, sync, connect, disconnect,
  }}>{children}</GoogleContext.Provider>;
}

export function useGoogle() {
  const context = useContext(GoogleContext);
  if (!context) throw new Error("GoogleProvider is missing");
  return context;
}
