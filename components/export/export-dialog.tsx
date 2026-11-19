"use client";

import { ArrowUpRight, Download, FileText, Printer } from "lucide-react";
import { useMemo, useState, type MouseEvent } from "react";
import { Dialog } from "@/components/dialog";
import { useGoogle } from "@/components/google/google-provider";
import { printHref, representScript, type ExportSource } from "@/lib/export/representation";
import { googleSession } from "@/lib/google/drive";
import { screenplayFormats } from "@/lib/screenplay";
import "./export.css";

export function ExportDialog({ project, onClose, flush }: {
  project: ExportSource & { id: string };
  onClose: () => void;
  flush: () => Promise<boolean>;
}) {
  const google = useGoogle();
  const [busy, setBusy] = useState<"pdf" | "docs" | null>(null);
  const [message, setMessage] = useState("");
  const [documentUrl, setDocumentUrl] = useState("");
  const script = useMemo(() => representScript(project), [project]);

  async function download() {
    setBusy("pdf");
    setMessage("");
    try {
      const { downloadScriptPdf } = await import("@/lib/export/pdf");
      await downloadScriptPdf(script);
      setMessage("สร้าง PDF แล้ว");
    } catch {
      setMessage("สร้าง PDF ไม่สำเร็จ กรุณาลองอีกครั้ง");
    } finally {
      setBusy(null);
    }
  }

  async function exportDocs() {
    setBusy("docs");
    setMessage("");
    setDocumentUrl("");
    try {
      const { accessToken } = await googleSession();
      if (!accessToken) {
        setMessage("เชื่อมบัญชี Google อีกครั้งก่อนส่งออก");
        return;
      }
      const { exportGoogleDoc } = await import("@/lib/export/docs");
      setDocumentUrl(await exportGoogleDoc(accessToken, project.id, script));
      setMessage("สร้างเอกสารในโฟลเดอร์โปรเจกต์แล้ว");
    } catch {
      setMessage("ส่งออกเป็น Google Docs ไม่สำเร็จ กรุณาลองอีกครั้ง");
    } finally {
      setBusy(null);
    }
  }

  async function preview(event: MouseEvent<HTMLAnchorElement>) {
    event.preventDefault();
    if (busy) return;
    const href = event.currentTarget.href;
    if (await flush()) window.location.assign(href);
    else setMessage("บันทึกบทก่อนเปิดหน้าสั่งพิมพ์ หรือดาวน์โหลด PDF จากฉบับที่กำลังแก้ไข");
  }

  return (
    <Dialog title="ส่งออกบท" onClose={onClose} busy={!!busy}>
      <div className="export-options">
        <p className="export-format">{screenplayFormats[project.format]}</p>
        <button type="button" className="primary-button" onClick={() => void download()} disabled={!!busy}>
          <Download size={17} /> {busy === "pdf" ? "กำลังสร้าง PDF…" : "ดาวน์โหลด PDF"}
        </button>
        <a className="secondary-button" href={printHref(project.id)} onClick={preview} aria-disabled={!!busy}>
          <Printer size={17} /> ตัวอย่างก่อนพิมพ์
        </a>
        <button type="button" className="secondary-button" disabled={!!busy || !google.connected || !google.online} onClick={() => void exportDocs()}>
          <FileText size={17} /> {busy === "docs" ? "กำลังสร้าง Google Docs…" : "ส่งออกเป็น Google Docs"}
        </button>
        {!google.connected && <p>เชื่อมบัญชีจากเมนู Google Drive เพื่อส่งออกเป็น Docs</p>}
        {google.connected && !google.online && <p>เชื่อมต่ออินเทอร์เน็ตเพื่อส่งออกเป็น Google Docs</p>}
        {message && <p role="status">{message}</p>}
        {documentUrl && <a className="primary-button" href={documentUrl} target="_blank" rel="noreferrer">
          เปิดใน Google Docs <ArrowUpRight size={17} />
        </a>}
      </div>
    </Dialog>
  );
}
