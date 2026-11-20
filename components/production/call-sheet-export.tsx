"use client";

import { Download, Printer, Share2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Dialog } from "@/components/dialog";
import { callSheetHref, type CallDocument } from "@/lib/call-sheet";
import { downloadFile } from "@/lib/export/download";

export function CallSheetExport({ projectId, sheet, onClose }: { projectId: string; sheet: CallDocument; onClose: () => void }) {
  const [file, setFile] = useState<File>();
  const [error, setError] = useState("");

  useEffect(() => {
    let canceled = false;
    setFile(undefined);
    setError("");
    void import("@/lib/export/call-sheet-pdf")
      .then(({ makeCallSheetPdf }) => makeCallSheetPdf(sheet))
      .then((pdf) => { if (!canceled) setFile(pdf); })
      .catch(() => { if (!canceled) setError("สร้าง PDF ไม่สำเร็จ ลองเปิดเมนูนี้ใหม่อีกครั้ง"); });
    return () => { canceled = true; };
  }, [sheet]);

  const canShare = file && navigator.canShare?.({ files: [file] });

  async function share() {
    if (!file) return;
    setError("");
    try {
      await navigator.share({ files: [file], title: sheet.header.title });
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        setError("แชร์ PDF ไม่สำเร็จ คุณสามารถดาวน์โหลดไฟล์ไปส่งต่อได้");
      }
    }
  }

  return (
    <Dialog title="พิมพ์ใบคิว / ส่งออก PDF" onClose={onClose}>
      <div className="call-export-options">
        <a className="secondary-button" href={callSheetHref(projectId, sheet.id, true)}>
          <Printer size={17} /> ตัวอย่างก่อนพิมพ์ A4 แนวนอน
        </a>
        <button type="button" className="primary-button" disabled={!file} onClick={() => file && downloadFile(file, file.name)}>
          <Download size={17} /> ดาวน์โหลด PDF
        </button>
        {canShare && <button type="button" className="secondary-button" onClick={() => void share()}><Share2 size={17} /> แชร์ไฟล์ PDF</button>}
        {!file && !error && <p role="status">กำลังเตรียม PDF…</p>}
        {error && <p className="form-error" role="alert">{error}</p>}
      </div>
    </Dialog>
  );
}
