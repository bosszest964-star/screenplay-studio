"use client";

import { ArrowDown, ArrowUp, X } from "lucide-react";
import { useState } from "react";
import { callHeaderGroups, castColumns, shootingColumns, type CallDocument, type CallHeader, type CastCall, type ShootingField } from "@/lib/call-sheet";

export function CallField({ label, value, onEdit, type = "text", placeholder, multiline, maxLength }: {
  label: string;
  value: string;
  onEdit: (value: string) => void;
  type?: "text" | "date" | "time";
  placeholder?: string;
  multiline?: boolean;
  maxLength?: number;
}) {
  const [draft, setDraft] = useState<string>();
  const props = {
    "aria-label": label,
    value: draft ?? value,
    placeholder,
    maxLength,
    onBlur: () => setDraft(undefined),
    onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setDraft(event.target.value);
      onEdit(event.target.value);
    },
  };
  return multiline ? <textarea {...props} rows={2} /> : <input {...props} type={type} />;
}

export function CallHeaderForm({ header, onEdit }: {
  header: CallHeader;
  onEdit: (field: keyof CallHeader, value: string) => void;
}) {
  return (
    <section className="call-header" aria-label="ข้อมูลหัวใบคิว">
      <h2 className="call-masthead">ใบคิวถ่ายทำ <span>CALL SHEET</span></h2>
      {callHeaderGroups.map((group, index) => (
        <div className={`call-header-fields call-header-group-${index}`} key={index}>
          {group.map((field) => (
            <label key={field.key} className={"emphasis" in field ? "call-time-focus" : undefined}>
              <span>{field.label}</span>
              <CallField label={field.label} value={header[field.key]} type={"type" in field ? field.type : undefined}
                maxLength={field.key === "queue" ? 16 : field.key === "version" ? 12 : 150}
                onEdit={(value) => onEdit(field.key, value)} />
            </label>
          ))}
        </div>
      ))}
    </section>
  );
}

export function ShootingTable({ rows, view, onEdit, onMove, onRemove }: {
  rows: CallDocument["rows"];
  view: "cards" | "table";
  onEdit: (id: string, field: ShootingField, value: string) => void;
  onMove: (id: string, offset: number) => void;
  onRemove: (id: string) => void;
}) {
  if (!rows.length) return <p className="call-empty">เลือกฉากจากบทเพื่อเริ่มจัดลำดับถ่ายทำ</p>;

  return (
    <div className="call-table-wrap" data-view={view}>
      <table className="call-shooting-table" aria-label="ลำดับถ่ายทำ">
        <colgroup>{shootingColumns.map(({ key, weight }) => <col key={key} style={{ width: `${weight}%` }} />)}</colgroup>
        <thead><tr>{shootingColumns.map(({ key, label }) => <th scope="col" key={key}>{label}</th>)}</tr></thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.sceneId}>
              {shootingColumns.map((column) => (
                <td key={column.key} data-field={column.key}>
                  <span className="call-card-label" aria-hidden="true">{column.label}</span>
                  {"editable" in column ? (
                    <CallField label={`SC ${row.number} ${column.label}`} value={row[column.key]}
                      placeholder={column.placeholder} multiline={column.key !== "time"}
                      onEdit={(value) => onEdit(row.sceneId, column.key, value)} />
                  ) : column.key === "order" ? (
                    <>
                      <strong>{row.order}</strong>
                      <div className="call-row-actions">
                        <button type="button" aria-label={`เลื่อนฉาก ${row.number} ขึ้น`} disabled={row.order === 1}
                          onClick={() => onMove(row.sceneId, -1)}><ArrowUp size={15} /></button>
                        <button type="button" aria-label={`เลื่อนฉาก ${row.number} ลง`} disabled={row.order === rows.length}
                          onClick={() => onMove(row.sceneId, 1)}><ArrowDown size={15} /></button>
                        <button type="button" aria-label={`นำฉาก ${row.number} ออกจากคิว`}
                          onClick={() => onRemove(row.sceneId)}><X size={15} /></button>
                      </div>
                    </>
                  ) : column.key === "number" ? (
                    <strong aria-label={row.missing ? `ฉาก ${row.number} ถูกนำออกจากบท` : undefined}>
                      {row.number}{row.missing && <sup>*</sup>}
                    </strong>
                  ) : (row[column.key] || "—")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function CastTable({ cast, onEdit }: {
  cast: CallDocument["cast"];
  onEdit: (key: string, field: Exclude<keyof CastCall, "key">, value: string) => void;
}) {
  if (!cast.length) return <p className="call-empty">รายชื่อจะมาจากช่อง Cast และ Support ของฉากในคิวนี้</p>;
  return (
    <div className="call-cast-wrap">
      <table className="call-cast-table" aria-label="คิวนักแสดง">
        <colgroup>{castColumns.map(({ label, weight }) => <col key={label} style={{ width: `${weight}%` }} />)}</colgroup>
        <thead><tr>{castColumns.map(({ label }) => <th scope="col" key={label}>{label}</th>)}</tr></thead>
        <tbody>{cast.map((person) => (
          <tr key={person.key}>
            <th scope="row">{person.name}</th>
            <td>{person.role}</td>
            <td><span className="call-card-label" aria-hidden="true">P/U Time</span>
              <CallField label={`${person.name} P/U Time`} value={person.pickup} type="time"
              onEdit={(value) => onEdit(person.key, "pickup", value)} /></td>
            <td><span className="call-card-label" aria-hidden="true">NOTE</span>
              <CallField label={`${person.name} NOTE`} value={person.note} multiline
              onEdit={(value) => onEdit(person.key, "note", value)} /></td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}
