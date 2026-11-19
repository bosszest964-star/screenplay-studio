"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { db } from "@/lib/projects";
import { GoogleRequestError } from "@/lib/google/drive";
import { backgroundSyncTag, synchronizeGoogleDrive } from "@/lib/google/sync";

const syncLabels = {
  checking: "Google Drive",
  setup: "Google Drive",
  disconnected: "Google Drive",
  syncing: "Syncing",
  synced: "Synced",
  offline: "Offline",
  error: "Sync error",
} as const;

type SyncStatus = keyof typeof syncLabels;

interface GoogleContextValue {
  status: SyncStatus;
  label: string;
  configured: boolean | null;
  connected: boolean;
  email?: string;
  online: boolean;
  message: string;
  sync: () => Promise<void>;
  disconnect: () => Promise<void>;
}

const GoogleContext = createContext<GoogleContextValue | null>(null);

async function queueBackgroundSync() {
  const serviceWorker = navigator.serviceWorker;
  if (!serviceWorker?.controller) return;
  try {
    const registration = await serviceWorker.ready as ServiceWorkerRegistration & {
      sync?: { register(tag: string): Promise<void> };
    };
    await registration.sync?.register(backgroundSyncTag);
  } catch {
    // Browsers without Background Sync retry on reconnect or when the app resumes.
  }
}

export function GoogleProvider({ children }: { children: ReactNode }) {
  const [online, setOnline] = useState(true);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [status, setStatus] = useState<SyncStatus>("checking");
  const [message, setMessage] = useState("");
  const pending = useRef<Promise<void> | null>(null);
  const signingOut = useRef(false);
  const rerun = useRef(false);
  const connection = useLiveQuery(() => db.cloudConnection.get("google").catch(() => undefined), []);
  const changes = useLiveQuery(() => db.projects.orderBy("updatedAt").keys().catch(() => []), []);

  const sync = useCallback(function run(): Promise<void> {
    if (signingOut.current) return Promise.resolve();
    if (!navigator.onLine) {
      void queueBackgroundSync();
      return Promise.resolve();
    }
    if (pending.current) {
      rerun.current = true;
      return pending.current;
    }

    setStatus("syncing");
    const operation = (async () => {
      try {
        const result = await synchronizeGoogleDrive();
        setConfigured(result.configured);
        if (result.connected) {
          setStatus("synced");
          if (result.conflicts) setMessage(`เก็บฉบับขัดแย้งเป็นโปรเจกต์แยก ${result.conflicts} รายการแล้ว`);
        } else {
          await db.cloudConnection.delete("google");
          setStatus(result.configured ? "disconnected" : "setup");
        }
      } catch (error) {
        if (error instanceof GoogleRequestError && error.status === 429) {
          setMessage("Google จำกัดจำนวนคำขอชั่วคราว ระบบจะลองซิงค์อีกครั้ง");
        } else {
          setMessage("ซิงค์ Drive ไม่สำเร็จ ข้อมูลยังบันทึกอยู่ในเครื่อง");
        }
        setStatus("error");
      } finally {
        pending.current = null;
        if (rerun.current && !signingOut.current) {
          rerun.current = false;
          void run();
        }
      }
    })();
    pending.current = operation;
    return operation;
  }, []);

  useEffect(() => {
    const update = () => {
      setOnline(navigator.onLine);
      if (navigator.onLine) void sync();
    };
    const url = new URL(window.location.href);
    if (url.searchParams.has("google")) {
      if (url.searchParams.get("google") === "error") setMessage("เชื่อมต่อ Google ไม่สำเร็จ ลองเชื่อมต่ออีกครั้ง");
      url.searchParams.delete("google");
      window.history.replaceState(window.history.state, "", url);
    }
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, [sync]);

  useEffect(() => {
    if (!connection) return;
    if (!online) {
      void queueBackgroundSync();
      return;
    }
    const timer = window.setTimeout(() => void sync(), 1_700);
    return () => window.clearTimeout(timer);
  }, [changes, online, connection?.accountId, sync]);

  useEffect(() => {
    if (configured === false || (!connection && status !== "error")) return;
    const awake = () => {
      if (document.visibilityState === "visible") void sync();
    };
    document.addEventListener("visibilitychange", awake);
    window.addEventListener("focus", awake);
    const timer = window.setInterval(awake, 45_000);
    return () => {
      document.removeEventListener("visibilitychange", awake);
      window.removeEventListener("focus", awake);
      window.clearInterval(timer);
    };
  }, [configured, connection?.accountId, status === "error", sync]);

  async function disconnect() {
    signingOut.current = true;
    rerun.current = false;
    setMessage("");
    try {
      await pending.current;
      const signOut = async () => {
        const response = await fetch("/api/google?action=disconnect", { method: "POST", cache: "no-store" });
        if (!response.ok) throw new Error("Disconnect failed");
        await db.cloudConnection.delete("google");
      };
      if (navigator.locks) await navigator.locks.request(backgroundSyncTag, signOut);
      else await signOut();
      setStatus("disconnected");
    } catch {
      setMessage("ออกจากบัญชี Google ไม่สำเร็จ");
    } finally {
      signingOut.current = false;
    }
  }

  const visibleStatus = online ? status : "offline";
  return (
    <GoogleContext.Provider value={{
      status: visibleStatus, label: syncLabels[visibleStatus], configured,
      connected: !!connection, email: connection?.email, online, message, sync, disconnect,
    }}>{children}</GoogleContext.Provider>
  );
}

export function useGoogle() {
  const connection = useContext(GoogleContext);
  if (!connection) throw new Error("GoogleProvider is missing");
  return connection;
}
