"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { ArrowLeft, Download, Printer } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { usePwa } from "@/components/use-pwa";
import { isBold, representScript, type ExportScript } from "@/lib/export/representation";
import { getProject } from "@/lib/projects";
import { editorHref } from "@/lib/screenplay";
import "./export.css";
import "./print.css";

function PrintDocument({ script }: { script: ExportScript }) {
  return (
    <article className={`print-document print-format-${script.format}`}>
      <header className="print-cover">
        <h1>{script.name}</h1>
        <p>บทภาพยนตร์</p>
      </header>
      {script.format === "two-column" ? (
        <table className="print-av">
          <thead><tr><th scope="col">ภาพ</th><th scope="col">เสียง</th></tr></thead>
          <tbody>
            {script.rows.map(({ visual, audio, heading }, index) => (
              <tr key={index} className={heading ? "print-scene-row" : undefined}><td>{visual}</td><td>{audio}</td></tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="print-script">
          {script.paragraphs.map(({ kind, text }, index) => (
            <p key={index} className={`print-paragraph print-${kind}`}>{isBold(kind) ? <strong>{text}</strong> : text}</p>
          ))}
        </div>
      )}
    </article>
  );
}

function PrintRoute() {
  const id = useSearchParams().get("project");
  const result = useLiveQuery(async () => {
    try { return { project: id ? await getProject(id) : undefined }; }
    catch { return { project: undefined }; }
  }, [id]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const project = result?.project;
  const script = project ? representScript(project) : undefined;

  async function download() {
    if (!script) return;
    setBusy(true);
    setMessage("");
    try {
      const { downloadScriptPdf } = await import("@/lib/export/pdf");
      await downloadScriptPdf(script);
    } catch {
      setMessage("สร้าง PDF ไม่สำเร็จ กรุณาลองอีกครั้ง");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="print-page">
      <nav className="print-toolbar" aria-label="ตัวอย่างก่อนพิมพ์">
        <a className="secondary-button" href={id ? editorHref(id) : "/"}><ArrowLeft size={17} /> กลับไปเขียนบท</a>
        {script && <div>
          <button className="secondary-button" type="button" onClick={() => void download()} disabled={busy}>
            <Download size={17} /> ดาวน์โหลด PDF
          </button>
          <button className="primary-button" type="button" onClick={async () => { await document.fonts.ready; window.print(); }}>
            <Printer size={17} /> พิมพ์
          </button>
        </div>}
      </nav>
      {message && <p className="print-message" role="alert">{message}</p>}
      {script ? <PrintDocument script={script} /> : <p className="print-message">{result ? "ไม่พบโปรเจกต์" : "กำลังเปิดบท…"}</p>}
    </main>
  );
}

export function PrintPage() {
  usePwa();
  return <Suspense fallback={<main className="print-page"><p className="print-message">กำลังเปิดบท…</p></main>}><PrintRoute /></Suspense>;
}
