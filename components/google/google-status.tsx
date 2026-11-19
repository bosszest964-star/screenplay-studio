"use client";

import { Cloud, CloudCheck, CloudOff, HardDrive, LoaderCircle, RefreshCw } from "lucide-react";
import { useState } from "react";
import { Dialog } from "@/components/dialog";
import { useGoogle } from "./google-provider";
import "./google.css";

export function GoogleStatus({ beforeConnect }: { beforeConnect?: () => Promise<boolean> }) {
  const google = useGoogle();
  const [open, setOpen] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const Icon = google.status === "offline" ? CloudOff : google.status === "syncing" ? LoaderCircle :
    google.status === "synced" ? CloudCheck : Cloud;

  async function connect() {
    if (beforeConnect && !await beforeConnect()) return;
    const returnTo = window.location.pathname + window.location.search;
    window.location.assign(`/api/google?action=connect&returnTo=${encodeURIComponent(returnTo)}`);
  }

  return (
    <>
      <button type="button" className="secondary-button google-status" data-status={google.status}
        aria-label={`Google Drive · ${google.label}`} onClick={() => setOpen(true)} title={`Google Drive · ${google.label}`}>
        <Icon size={17} /><span>{google.label}</span>
      </button>
      {open && (
        <Dialog title="Google Drive" onClose={() => setOpen(false)} busy={disconnecting}>
          <div className="google-panel">
            <div className="google-account">
              <HardDrive size={20} />
              <div><strong>{google.email ?? (google.connected ? "เชื่อมต่อบัญชี Google แล้ว" : "บัญชี Google")}</strong>
                <p role="status">{google.configured === false && google.online ? "ยังไม่ได้ตั้งค่า Google OAuth" : google.label}</p>
              </div>
            </div>
            {google.configured === false && <p>ตั้งค่า Google OAuth ใน Vercel ตามคู่มือ SETUP_GOOGLE.md เพื่อเริ่มซิงค์</p>}
            {!google.online && <p>แก้ไขงานในเครื่องได้ การซิงค์จะทำงานเมื่อเชื่อมต่ออินเทอร์เน็ตอีกครั้ง</p>}
            {google.message && <p role="status">{google.message}</p>}
            {google.connected ? (
              <div className="dialog-actions">
                <button type="button" className="secondary-button" disabled={!google.online || disconnecting} onClick={async () => {
                  setDisconnecting(true);
                  await google.disconnect();
                  setDisconnecting(false);
                }}>ออกจากบัญชี</button>
                <button type="button" className="primary-button" disabled={!google.online || google.status === "syncing" || disconnecting}
                  onClick={() => void google.sync()}><RefreshCw size={16} /> ดึงโปรเจกต์จาก Drive</button>
              </div>
            ) : google.configured && (
              <div className="dialog-actions">
                <button type="button" className="primary-button" disabled={!google.online} onClick={() => void connect()}>
                  เชื่อมต่อบัญชี Google
                </button>
              </div>
            )}
          </div>
        </Dialog>
      )}
    </>
  );
}
