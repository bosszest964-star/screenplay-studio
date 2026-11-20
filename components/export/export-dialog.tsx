"use client";

import { Archive, ArrowUpRight, Copy, Download, FileText, Printer } from "lucide-react";
import { useMemo, useState, type MouseEvent } from "react";
import { Dialog } from "@/components/dialog";
import { useGoogle } from "@/components/google/google-provider";
import { downloadBackup } from "@/lib/export/backup";
import { copyRichScript } from "@/lib/export/clipboard";
import { printHref, representScript } from "@/lib/export/representation";
import { QuickSyncClient } from "@/lib/quick-sync/client";
import { screenplayFormats, type Project } from "@/lib/screenplay";
import "./export.css";

export function ExportDialog({ project, onClose, flush }: {
  project: Project;
  onClose: () => void;
  flush: () => Promise<boolean>;
}) {
  const google = useGoogle();
  const [busy, setBusy] = useState<"pdf" | "docs" | "backup" | null>(null);
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
    if (!google.connection) return;
    setBusy("docs");
    setMessage("");
    setDocumentUrl("");
    try {
      setDocumentUrl(await new QuickSyncClient(google.connection).exportDocs(project.id, script));
      setMessage("สร้างเอกสารในโฟลเดอร์โปรเจกต์แล้ว");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "ส่งออกเป็น Google Docs ไม่สำเร็จ กรุณาลองอีกครั้ง");
    } finally {
      setBusy(null);
    }
  }

  async function copy() {
    try {
      await copyRichScript(script);
      setMessage("คัดลอกบทพร้อมรูปแบบแล้ว เปิด Google Docs แล้วกดวางได้ทันที");
    } catch {
      setMessage("คัดลอกไม่สำเร็จ ตรวจสิทธิ์คลิปบอร์ดแล้วลองอีกครั้ง");
    }
  }

  async function saveBackup() {
    setBusy("backup");
    setMessage("");
    try {
      await downloadBackup(project);
      setMessage("ดาวน์โหลดไฟล์สำรองแล้ว ส่งไฟล์นี้ไปเปิดจากหน้าโปรเจกต์บนเครื่องอื่นได้");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "สร้างไฟล์สำรองไม่สำเร็จ");
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
        <button type="button" className="secondary-button" disabled={!!busy} onClick={() => void copy()}>
          <Copy size={17} /> คัดลอกบทไปวาง Google Docs ทันที
        </button>
        <button type="button" className="secondary-button" disabled={!!busy || !google.connected || !google.online} onClick={() => void exportDocs()}>
          <FileText size={17} /> {busy === "docs" ? "กำลังสร้าง Google Docs…" : "ส่งออกเป็น Google Docs"}
        </button>
        {!google.connected && <p>ตั้งค่า Quick Sync จากปุ่มซิงค์ข้อมูลเพื่อสร้างเอกสารบน Drive</p>}
        {google.connected && !google.online && <p>เชื่อมต่ออินเทอร์เน็ตเพื่อส่งออกเป็น Google Docs</p>}
        <button type="button" className="secondary-button" disabled={!!busy} onClick={() => void saveBackup()}>
          <Archive size={17} /> {busy === "backup" ? "กำลังเตรียมไฟล์…" : "ดาวน์โหลดไฟล์สำรองโปรเจกต์"}
        </button>
        {message && <p role="status">{message}</p>}
        {documentUrl && <a className="primary-button" href={documentUrl} target="_blank" rel="noreferrer">
          เปิดใน Google Docs <ArrowUpRight size={17} />
        </a>}
      </div>
    </Dialog>
  );
}
