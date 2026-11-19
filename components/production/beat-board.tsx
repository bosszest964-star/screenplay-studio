"use client";

import {
  closestCenter, DndContext, KeyboardSensor, MouseSensor, TouchSensor, useSensor, useSensors,
} from "@dnd-kit/core";
import { rectSortingStrategy, SortableContext, sortableKeyboardCoordinates, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ArrowDown, ArrowRight, ArrowUp, Clapperboard, Grip, LayoutGrid, PencilLine, Plus, Trash2,
} from "lucide-react";
import { useId, useMemo, useState, type FormEvent } from "react";
import { Dialog } from "@/components/dialog";
import { beatColors, beatTitle, boardCards, type BeatCard, type BeatColor } from "@/lib/production";
import { convertBeat, deleteBeat, moveBeat, saveBeat } from "@/lib/production-data";
import { editorHref, sceneText, sceneTimes, type Project, type SceneHeading } from "@/lib/screenplay";

interface BeatTileProps {
  card: BeatCard;
  index: number;
  sceneNumber?: number;
  projectId: string;
  busy: boolean;
  canMoveDown: boolean;
  onMove: (direction: -1 | 1) => void;
  onEdit: () => void;
  onConvert: () => void;
}

function BeatTile({ card, index, sceneNumber, projectId, busy, canMoveDown, onMove, onEdit, onConvert }: BeatTileProps) {
  const { attributes, listeners, transform, transition, setNodeRef, setActivatorNodeRef, isDragging } =
    useSortable({ id: card.id, disabled: busy });
  const title = beatTitle(card);

  return (
    <article
      ref={setNodeRef} className="beat-card" data-color={card.color} data-dragging={isDragging}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      <div className="beat-meta">
        <span className="beat-order font-mono">{String(index + 1).padStart(2, "0")}</span>
        <span className="beat-badge">{sceneNumber ? `ฉาก ${sceneNumber}` : "โครงเรื่อง"}</span>
        <button
          type="button" ref={setActivatorNodeRef} className="icon-button beat-handle" disabled={busy}
          {...attributes} {...listeners} aria-label={`ลากการ์ด ${title}`} title="ลากเพื่อจัดลำดับ"
        >
          <Grip size={19} />
        </button>
      </div>
      <h2>{title}</h2>
      {(card.title || !card.sceneId) && card.scene.location && <p className="beat-slug">{sceneText(card.scene, "thai")}</p>}
      {card.notes && <p className="beat-notes">{card.notes}</p>}
      <div className="beat-footer">
        {card.sceneId ? (
          <a className="beat-link" href={editorHref(projectId, card.sceneId)}>เปิดในบท <ArrowRight size={15} /></a>
        ) : (
          <button className="beat-link" type="button" disabled={busy} onClick={onConvert}>
            <Clapperboard size={15} /> แปลงเป็นหัวฉาก
          </button>
        )}
        <div className="beat-tile-actions">
          <button className="icon-button" type="button" disabled={busy || index === 0}
            aria-label={`เลื่อนขึ้น ${title}`} onClick={() => onMove(-1)}><ArrowUp size={15} /></button>
          <button className="icon-button" type="button" disabled={busy || !canMoveDown}
            aria-label={`เลื่อนลง ${title}`} onClick={() => onMove(1)}><ArrowDown size={15} /></button>
          <button className="icon-button" type="button" disabled={busy}
            aria-label={`แก้ไขการ์ด ${title}`} onClick={onEdit}><PencilLine size={16} /></button>
        </div>
      </div>
    </article>
  );
}

function BeatForm({ project, original, busy, error, onSave, onDelete, onClose }: {
  project: Project;
  original: BeatCard | null;
  busy: boolean;
  error: string;
  onSave: (draft: BeatCard) => void;
  onDelete: (draft: BeatCard) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<BeatCard>(() => original ?? ({
    id: crypto.randomUUID(), title: "", notes: "", color: "sand",
    scene: { setting: "INT.", location: "", time: "DAY" },
  }));
  const locationListId = useId();
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [invalidTitle, setInvalidTitle] = useState(false);
  const updateScene = (change: Partial<SceneHeading>) => setDraft((current) => ({ ...current, scene: { ...current.scene, ...change } }));

  function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (deleteConfirm) return onDelete(draft);
    if (!draft.title.trim() && !draft.sceneId) return setInvalidTitle(true);
    onSave({ ...draft, title: draft.title.trim(), notes: draft.notes.trim() });
  }

  return (
    <Dialog title={deleteConfirm ? "ลบการ์ดโครงเรื่อง" : original ? "แก้ไขการ์ด" : "เพิ่มการ์ดโครงเรื่อง"}
      onClose={onClose} busy={busy}>
      <form className="production-form" onSubmit={submit}>
        {deleteConfirm ? <p className="dialog-text">ลบการ์ด “{beatTitle(draft)}” ออกจากกระดานหรือไม่?</p> : (
          <>
            <label className="name-field">ชื่อการ์ด
              <input data-initial-focus required={!draft.sceneId} maxLength={110} value={draft.title}
                placeholder={draft.sceneId ? beatTitle(draft) : "เช่น การพบกันครั้งแรก"}
                onChange={(event) => {
                  setInvalidTitle(false);
                  setDraft({ ...draft, title: event.target.value });
                }} />
            </label>
            <label className="name-field">โครงเรื่อง / หมายเหตุ
              <textarea rows={3} value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} />
            </label>
            <fieldset>
              <legend>สีการ์ด</legend>
              <div className="beat-palette">
                {(Object.entries(beatColors) as [BeatColor, string][]).map(([color, label]) => (
                  <label key={color} data-color={color}>
                    <input type="radio" name="beat-color" checked={draft.color === color} onChange={() => setDraft({ ...draft, color })} />
                    <span>{label}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            {!draft.sceneId && (
              <div className="beat-scene-form">
                <label className="name-field">ภายใน / ภายนอก
                  <select value={draft.scene.setting} onChange={(event) => updateScene({ setting: event.target.value as SceneHeading["setting"] })}>
                    <option value="INT.">INT. ภายใน</option><option value="EXT.">EXT. ภายนอก</option>
                  </select>
                </label>
                <label className="name-field">แสง / เวลา
                  <select value={draft.scene.time} onChange={(event) => updateScene({ time: event.target.value as SceneHeading["time"] })}>
                    {Object.entries(sceneTimes).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </label>
                <label className="name-field">สถานที่
                  <input list={locationListId} value={draft.scene.location} placeholder="เว้นว่างเพื่อใช้ชื่อการ์ด"
                    onChange={(event) => updateScene({ location: event.target.value })} />
                  <datalist id={locationListId}>
                    {project.locations?.map(({ id, name }) => <option key={id} value={name} />)}
                  </datalist>
                </label>
              </div>
            )}
            {project.characters && project.characters.length > 0 && (
              <fieldset>
                <legend>ตัวละครในฉาก</legend>
                <div className="beat-cast">
                  {project.characters.map(({ id, name }) => (
                    <label key={id}>
                      <input type="checkbox" checked={draft.castIds?.includes(id) ?? false}
                        onChange={(event) => {
                          const ids = draft.castIds ?? [];
                          setDraft({ ...draft, castIds: event.target.checked ? [...ids, id] : ids.filter((value) => value !== id) });
                        }} />
                      {name}
                    </label>
                  ))}
                </div>
              </fieldset>
            )}
          </>
        )}
        {(error || invalidTitle) && <p className="form-error" role="alert">{error || "กรุณาระบุชื่อการ์ด"}</p>}
        <div className="dialog-actions production-form-actions">
          {original && !original.sceneId && !deleteConfirm && (
            <button type="button" className="secondary-button danger-text production-delete" onClick={() => setDeleteConfirm(true)} disabled={busy}>
              <Trash2 size={15} /> ลบการ์ด
            </button>
          )}
          <button type="button" className="secondary-button" disabled={busy} onClick={deleteConfirm ? () => setDeleteConfirm(false) : onClose}>ยกเลิก</button>
          <button className={deleteConfirm ? "danger-button" : "primary-button"} type="submit" disabled={busy}>
            {deleteConfirm ? "ลบการ์ด" : "บันทึกการ์ด"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

export function BeatBoard({ project }: { project: Project }) {
  const cards = useMemo(() => boardCards(project.blocks, project.beats), [project.blocks, project.beats]);
  const dragId = useId();
  const [editing, setEditing] = useState<BeatCard | null | undefined>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 260, tolerance: 7 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  async function apply(operation: () => Promise<unknown>, closeEditor = false) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await operation();
      if (closeEditor) setEditing(undefined);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "บันทึกการ์ดไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  function changeOrder(source: string, target: string) {
    if (source !== target) void apply(() => moveBeat(project.id, source, target));
  }

  const linkedCount = cards.filter((card) => card.sceneId).length;
  let sceneNumber = 0;
  return (
    <>
      <div className="production-heading">
        <div><h1>Beat Board</h1><p>{linkedCount} ฉากในบท · {cards.length - linkedCount} การ์ดโครงเรื่อง</p></div>
        <button className="primary-button" type="button" onClick={() => { setError(""); setEditing(null); }}>
          <Plus size={18} /> เพิ่มการ์ด
        </button>
      </div>
      {error && editing === undefined && <p className="production-alert" role="alert">{error}</p>}
      {cards.length === 0 ? (
        <div className="production-empty">
          <LayoutGrid size={29} /><h2>เริ่มวางลำดับเรื่อง</h2><p>เพิ่มการ์ดโครงเรื่องเพื่อจัดลำดับก่อนสร้างหัวฉาก</p>
        </div>
      ) : (
        <DndContext id={dragId} collisionDetection={closestCenter} sensors={sensors}
          accessibility={{
            screenReaderInstructions: { draggable: "กด Space เพื่อเริ่มลาก ใช้ปุ่มลูกศรจัดลำดับ กด Space เพื่อวาง หรือ Esc เพื่อยกเลิก" },
          }}
          onDragEnd={({ active, over }) => { if (over) changeOrder(String(active.id), String(over.id)); }}>
          <SortableContext items={cards.map(({ id }) => id)} strategy={rectSortingStrategy}>
            <div className="beat-grid">
              {cards.map((card, index) => (
                <BeatTile
                  key={card.id} card={card} index={index} projectId={project.id} busy={busy}
                  sceneNumber={card.sceneId ? ++sceneNumber : undefined} canMoveDown={index + 1 < cards.length}
                  onMove={(direction) => changeOrder(card.id, cards[index + direction].id)}
                  onEdit={() => { setError(""); setEditing(card); }}
                  onConvert={() => void apply(() => convertBeat(project.id, card.id))}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
      {editing !== undefined && (
        <BeatForm project={project} original={editing} busy={busy} error={error}
          onSave={(card) => void apply(() => saveBeat(project.id, card, editing === null), true)}
          onDelete={(card) => void apply(() => deleteBeat(project.id, card.id), true)}
          onClose={() => { setError(""); setEditing(undefined); }} />
      )}
    </>
  );
}
