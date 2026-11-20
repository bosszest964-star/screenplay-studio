"use client";

import { CalendarDays, Download, LayoutList, ListPlus, Plus, Printer, Table2, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Dialog } from "@/components/dialog";
import {
  callDate, callFilename, callSheetCsv, callSheetHref, resolveCallSheet, shootingRow, shootingScenes,
  type CallHeader, type CallSheet, type CastCall, type ShootingField,
} from "@/lib/call-sheet";
import { downloadFile } from "@/lib/export/download";
import { addCallSheet, editCallSheet } from "@/lib/production-data";
import type { Project } from "@/lib/screenplay";
import { CallSheetExport } from "./call-sheet-export";
import { CallField, CallHeaderForm, CastTable, ShootingTable } from "./call-sheet-fields";
import "./call-sheet-form.css";

function ScenePicker({ scenes, rows, onClose, onAdd }: {
  scenes: ReturnType<typeof shootingScenes>;
  rows: CallSheet["rows"];
  onClose: () => void;
  onAdd: (ids: Set<string>) => Promise<boolean>;
}) {
  const [checked, setChecked] = useState(new Set<string>());
  const [busy, setBusy] = useState(false);
  const inSheet = new Set(rows.map(({ sceneId }) => sceneId));
  const selected = [...scenes.keys()].filter((id) => checked.has(id) && !inSheet.has(id));

  async function add() {
    setBusy(true);
    if (await onAdd(new Set(selected))) onClose();
    else setBusy(false);
  }

  return (
    <Dialog title="ดึงฉากจากบทเข้าคิวนี้" onClose={onClose} busy={busy}>
      {scenes.size ? (
        <div className="call-scene-picker">
          {[...scenes].map(([id, scene]) => (
            <label key={id}>
              <input type="checkbox" disabled={busy || inSheet.has(id)} checked={inSheet.has(id) || checked.has(id)}
                aria-label={`ฉาก ${scene.number} ${scene.location}`}
                onChange={(event) => {
                  const next = new Set(checked);
                  if (event.target.checked) next.add(id);
                  else next.delete(id);
                  setChecked(next);
                }} />
              <strong>SC {scene.number}</strong>
              <span>{scene.location || "ยังไม่ระบุสถานที่"}</span>
              <small>{inSheet.has(id) ? "อยู่ในคิวแล้ว" : `${scene.dayNight} / ${scene.interiorExterior}`}</small>
            </label>
          ))}
        </div>
      ) : <p className="dialog-text">ยังไม่มีหัวฉากในบท เพิ่มหัวฉากจากหน้าเขียนบทก่อนจัดคิว</p>}
      <div className="dialog-actions">
        <button className="secondary-button" type="button" disabled={busy} onClick={onClose}>ปิด</button>
        <button className="primary-button" type="button" disabled={busy || !selected.length} onClick={() => void add()}>
          เพิ่ม {selected.length} ฉาก
        </button>
      </div>
    </Dialog>
  );
}

export function CallSchedule({ project, initialSheet }: { project: Project; initialSheet: string | null }) {
  const [selectedId, setSelectedId] = useState(initialSheet);
  const [dialog, setDialog] = useState<"scenes" | "export" | "delete" | null>(null);
  const [view, setView] = useState<"cards" | "table">("cards");
  const [writes, setWrites] = useState(0);
  const [error, setError] = useState("");
  const sheets = project.callSheets ?? [];
  const active = sheets.find((sheet) => sheet.id === selectedId) ?? sheets[0];
  const scenes = useMemo(() => shootingScenes(project), [project]);
  const sheetDocument = useMemo(() => active && resolveCallSheet(active, scenes, project.name), [active, scenes, project.name]);

  function select(id: string) {
    setSelectedId(id);
    setError("");
    window.history.replaceState(null, "", callSheetHref(project.id, id));
  }

  async function save<T>(action: () => Promise<T>) {
    setWrites((value) => value + 1);
    setError("");
    try {
      return { ok: true as const, data: await action() };
    } catch (error) {
      setError(error instanceof Error ? error.message : "บันทึกใบคิวไม่สำเร็จ");
      return { ok: false as const };
    } finally {
      setWrites((value) => value - 1);
    }
  }

  async function edit(change: Parameters<typeof editCallSheet>[2]) {
    if (!active) return false;
    return (await save(() => editCallSheet(project.id, active.id, change))).ok;
  }

  async function create() {
    const result = await save(() => addCallSheet(project.id));
    if (result.ok) select(result.data);
  }

  function changeHeader(field: keyof CallHeader, value: string) {
    void edit((sheet) => ({ ...sheet, header: { ...sheet.header, [field]: value } }));
  }

  function importScenes(ids: Set<string>) {
    return edit((sheet, current) => {
      const inSheet = new Set(sheet.rows.map(({ sceneId }) => sceneId));
      const added = [...shootingScenes(current)].flatMap(([sceneId, source]) =>
        ids.has(sceneId) && !inSheet.has(sceneId) ? [shootingRow(sceneId, source)] : []);
      return added.length ? { ...sheet, rows: [...sheet.rows, ...added] } : sheet;
    });
  }

  function changeRow(id: string, field: ShootingField, value: string) {
    void edit((sheet) => ({
      ...sheet, rows: sheet.rows.map((row) => row.sceneId === id ? { ...row, [field]: value } : row),
    }));
  }

  function moveRow(id: string, offset: number) {
    void edit((sheet) => {
      const index = sheet.rows.findIndex(({ sceneId }) => id === sceneId);
      const target = index + offset;
      if (index < 0 || target < 0 || target >= sheet.rows.length) return sheet;
      const rows = [...sheet.rows];
      const [row] = rows.splice(index, 1);
      rows.splice(target, 0, row);
      return { ...sheet, rows };
    });
  }

  function changeCast(key: string, field: Exclude<keyof CastCall, "key">, value: string) {
    void edit((sheet) => {
      const previous = sheet.castCalls.find((call) => call.key === key);
      const next = { ...(previous ?? { key, pickup: "", note: "" }), [field]: value };
      return {
        ...sheet, castCalls: previous
          ? sheet.castCalls.map((call) => call.key === key ? next : call)
          : [...sheet.castCalls, next],
      };
    });
  }

  return (
    <div className="call-schedule">
      <div className="production-heading call-heading">
        <div><h1>ใบคิวถ่ายทำ</h1><p>Breakdown / Call Sheet</p></div>
        <button className="primary-button" type="button" onClick={() => void create()} disabled={writes > 0}>
          <Plus size={18} /> สร้างใบคิว
        </button>
      </div>
      {error && <p className="production-alert" role="alert">{error}</p>}
      {!active || !sheetDocument ? (
        <div className="production-empty">
          <CalendarDays size={29} />
          <h2>ยังไม่มีใบคิวถ่ายทำ</h2>
          <p>สร้างใบคิวแรกเพื่อระบุวันนัดกองและเลือกฉากจากบท</p>
        </div>
      ) : (
        <>
          <div className="call-workbar">
            <div className="call-day-list" role="group" aria-label="ใบคิวของโปรเจกต์">
              {sheets.map((sheet) => (
                <button type="button" key={sheet.id} aria-pressed={sheet.id === active.id} onClick={() => select(sheet.id)}>
                  <strong>{sheet.header.queue || "ใบคิว"}</strong>
                  {sheet.header.date && <small>{callDate(sheet.header.date)}</small>}
                </button>
              ))}
            </div>
            <div className="call-export-actions">
              <span className="call-save-state" role="status">{writes ? "กำลังบันทึก…" : error ? "บันทึกไม่สำเร็จ" : "บันทึกแล้ว"}</span>
              <button type="button" className="secondary-button" disabled={!!writes} onClick={() => setDialog("export")}>
                <Printer size={16} /> พิมพ์ใบคิว / ส่งออก PDF
              </button>
              <button type="button" className="secondary-button" disabled={!!writes} onClick={() =>
                downloadFile(new Blob([callSheetCsv(sheetDocument)], { type: "text/csv;charset=utf-8" }), callFilename(sheetDocument) + ".csv")}>
                <Download size={16} /> CSV
              </button>
              <button type="button" className="icon-button call-delete" aria-label="ลบใบคิวนี้" title="ลบใบคิวนี้"
                disabled={!!writes} onClick={() => setDialog("delete")}><Trash2 size={17} /></button>
            </div>
          </div>
          <div className="call-paper" key={active.id}>
            <CallHeaderForm header={active.header} onEdit={changeHeader} />
            <section aria-labelledby="call-breakdown-title">
              <div className="call-section-bar">
                <h2 id="call-breakdown-title">ลำดับถ่ายทำ <span>Shooting Breakdown</span></h2>
                <button className="secondary-button" type="button" onClick={() => setDialog("scenes")}>
                  <ListPlus size={17} /> ดึงฉากจากบทเข้าคิวนี้
                </button>
              </div>
              {!!sheetDocument.rows.length && <div className="call-view-switch" role="group" aria-label="มุมมองลำดับถ่ายทำ">
                <button type="button" aria-pressed={view === "cards"} onClick={() => setView("cards")}><LayoutList size={17} /> มุมมองการ์ดรายคิว</button>
                <button type="button" aria-pressed={view === "table"} onClick={() => setView("table")}><Table2 size={17} /> มุมมองตารางเต็ม</button>
              </div>}
              <ShootingTable rows={sheetDocument.rows} view={view} onEdit={changeRow} onMove={moveRow}
                onRemove={(id) => void edit((sheet) => ({ ...sheet, rows: sheet.rows.filter(({ sceneId }) => sceneId !== id) }))} />
              {sheetDocument.rows.some((row) => row.missing) && <p className="call-footnote">* ฉากที่ถูกนำออกจากบท ใช้ข้อมูลที่บันทึกไว้</p>}
            </section>
            <section aria-labelledby="cast-call-title">
              <div className="call-section-bar"><h2 id="cast-call-title">คิวนักแสดง <span>Cast Call</span></h2></div>
              <CastTable cast={sheetDocument.cast} onEdit={changeCast} />
            </section>
            <section aria-labelledby="production-note-title">
              <div className="call-section-bar"><h2 id="production-note-title">หมายเหตุกองถ่าย <span>Production Note</span></h2></div>
              <div className="call-production-note">
                <CallField label="Production Note" value={active.productionNote} multiline
                  placeholder="ข้อมูลสำคัญสำหรับทีมงานทั้งกอง"
                  onEdit={(productionNote) => void edit((sheet) => ({ ...sheet, productionNote }))} />
              </div>
            </section>
          </div>
          {dialog === "scenes" && <ScenePicker scenes={scenes} rows={active.rows} onAdd={importScenes} onClose={() => setDialog(null)} />}
          {dialog === "export" && <CallSheetExport projectId={project.id} sheet={sheetDocument} onClose={() => setDialog(null)} />}
          {dialog === "delete" && (
            <Dialog title="ลบใบคิวถ่ายทำ" busy={!!writes} onClose={() => setDialog(null)}>
              <p className="dialog-text">ลบใบคิว {active.header.queue || "ที่เลือก"} หรือไม่?</p>
              <div className="dialog-actions">
                <button className="secondary-button" type="button" data-initial-focus disabled={!!writes} onClick={() => setDialog(null)}>ยกเลิก</button>
                <button className="danger-button" type="button" disabled={!!writes} onClick={async () => {
                  if (await edit(() => null)) setDialog(null);
                }}>ลบใบคิว</button>
              </div>
            </Dialog>
          )}
        </>
      )}
    </div>
  );
}
