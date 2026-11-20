"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { ArrowLeft, Printer } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { usePwa } from "@/components/use-pwa";
import {
  callDate, callHeaderGroups, callSheetHref, castCells, castColumns,
  resolveCallSheet, shootingCells, shootingColumns, shootingScenes, type CallDocument,
} from "@/lib/call-sheet";
import { getProject } from "@/lib/projects";
import "./call-sheet-print.css";

function PrintTable({ title, columns, rows }: {
  title: string;
  columns: readonly { label: string; weight: number }[];
  rows: { key: string; cells: string[] }[];
}) {
  return (
    <table>
      <colgroup>{columns.map(({ label, weight }) => <col key={label} style={{ width: `${weight}%` }} />)}</colgroup>
      <thead>
        <tr><th className="call-print-band" colSpan={columns.length} scope="colgroup">{title}</th></tr>
        <tr>{columns.map(({ label }) => <th key={label} scope="col">{label}</th>)}</tr>
      </thead>
      <tbody>{rows.map(({ key, cells }) => (
        <tr key={key}>{cells.map((cell, index) => <td key={index}>{cell}</td>)}</tr>
      ))}</tbody>
    </table>
  );
}

function PrintDocument({ sheet }: { sheet: CallDocument }) {
  return (
    <article className="call-print-paper">
      <header>
        <h1>ใบคิวถ่ายทำ <span>CALL SHEET</span></h1>
        <strong>{sheet.header.queue} {sheet.header.version && `/ V${sheet.header.version}`}</strong>
      </header>
      {callHeaderGroups.map((group, index) => (
        <dl className={`call-print-meta call-print-meta-${index}`} key={index}>
          {group.map(({ key, label }) => (
            <div key={key} data-call-time={key === "crewCall" || key === "shootCall" || undefined}>
              <dt>{label}</dt><dd>{(key === "date" ? callDate(sheet.header.date) : sheet.header[key]) || "—"}</dd>
            </div>
          ))}
        </dl>
      ))}
      <PrintTable title="ลำดับถ่ายทำ / Shooting Breakdown" columns={shootingColumns}
        rows={sheet.rows.map((row) => ({ key: row.sceneId, cells: shootingCells(row) }))} />
      {sheet.rows.some((row) => row.missing) && <p className="call-print-footnote">* ฉากที่ถูกนำออกจากบท ใช้ข้อมูลที่บันทึกไว้</p>}
      <PrintTable title="คิวนักแสดง / Cast Call" columns={castColumns}
        rows={sheet.cast.map((person) => ({ key: person.key, cells: castCells(person) }))} />
      {sheet.productionNote && (
        <section className="call-print-note">
          <h2>Production Note / หมายเหตุกองถ่าย</h2>
          <p>{sheet.productionNote}</p>
        </section>
      )}
    </article>
  );
}

function PrintRoute() {
  const search = useSearchParams();
  const id = search.get("project");
  const sheetId = search.get("sheet");
  const data = useLiveQuery(async () => {
    try { return { project: id ? await getProject(id) : undefined }; }
    catch { return { project: undefined }; }
  }, [id]);
  const project = data?.project;
  const sheet = project?.callSheets?.find((entry) => entry.id === sheetId);

  return (
    <main className="call-print-page">
      <nav aria-label="ตัวอย่างก่อนพิมพ์ใบคิว">
        <a className="secondary-button" href={id ? callSheetHref(id, sheetId ?? undefined) : "/"}>
          <ArrowLeft size={17} /> กลับไปใบคิว
        </a>
        {sheet && <button className="primary-button" type="button" onClick={async () => {
          await document.fonts.ready;
          window.print();
        }}><Printer size={17} /> พิมพ์ A4 แนวนอน</button>}
      </nav>
      {project && sheet ? <PrintDocument sheet={resolveCallSheet(sheet, shootingScenes(project), project.name)} />
        : <p className="call-print-status">{data ? "ไม่พบใบคิวนี้" : "กำลังเปิดใบคิว…"}</p>}
    </main>
  );
}

export function CallSheetPrint() {
  usePwa();
  return <Suspense fallback={<p className="call-print-status">กำลังเปิดใบคิว…</p>}><PrintRoute /></Suspense>;
}
