"use client";

import {
  ArrowLeft, BookOpen, Check, ChevronsUpDown, CircleAlert, Clapperboard, Clock3, LayoutGrid,
  LayoutList, LoaderCircle, MessageCircle, Moon, Plus, Quote, Settings2, Sun, X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import { flushSync } from "react-dom";
import { Dialog } from "@/components/dialog";
import { productionHref, splitScript } from "@/lib/production";
import { getProject } from "@/lib/projects";
import { estimateRuntime } from "@/lib/script-analytics";
import {
  blocksFromSpeedEntries, cycleBlockKind, distinctNames, enterKinds, hasBlockContent,
  newTextBlock, pendingSpeedEntry, sceneFields, sceneText, screenplayFormats, textBlockLabels,
  type EditorDraft, type Project, type SceneHeading, type ScreenplayBlock, type ScreenplayFormat,
  type SpeedSession, type TextBlock, type TextBlockKind,
} from "@/lib/screenplay";
import { EditorTools, QuickActions, SceneOutline } from "./editor-tools";
import { isComposing, keepTypingFocus } from "./fields";
import { SceneReferences } from "./scene-references";
import { fieldId, ScriptRows } from "./script-rows";
import { SpeedDialogue } from "./speed-dialogue";
import { useKeyboardInset } from "./use-keyboard-inset";
import { useProjectDraft } from "./use-project-draft";

type TextControl = HTMLInputElement | HTMLTextAreaElement;
const formats = Object.entries(screenplayFormats) as [ScreenplayFormat, string][];
const saveLabels = {
  saved: "บันทึกแล้ว",
  saving: "กำลังบันทึก",
  error: "บันทึกไม่สำเร็จ",
  conflict: "มีการแก้ไขจากอีกแท็บ",
};

function insertAfter(blocks: ScreenplayBlock[], id: string | null, inserted: ScreenplayBlock[]) {
  const index = blocks.findIndex((block) => block.id === id);
  const position = index === -1 ? blocks.length : index + 1;
  return [...blocks.slice(0, position), ...inserted, ...blocks.slice(position)];
}

export function ScreenplayEditor({ project, initialSceneId, onToggleTheme }: {
  project: Project;
  initialSceneId: string | null;
  onToggleTheme: () => void;
}) {
  const { draft, status, update, flush, loadLatest } = useProjectDraft(project);
  const [starter] = useState(() => newTextBlock("sceneHeading"));
  const [activeId, setActiveId] = useState(initialSceneId);
  const [drawer, setDrawer] = useState(false);
  const [references, setReferences] = useState<"panel" | "drawer" | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [confirmReload, setConfirmReload] = useState(false);
  const [speedError, setSpeedError] = useState("");
  const shellRef = useRef<HTMLDivElement>(null);
  const formatRef = useRef<HTMLSelectElement>(null);
  useKeyboardInset(shellRef);

  const blocks = useMemo(() => draft.blocks.length ? draft.blocks : [starter], [draft.blocks, starter]);
  const active = blocks.find(({ id }) => id === activeId) ?? blocks[0];
  const speed = draft.speedSession;
  const dialogueQuotes = draft.dialogueQuotes ?? draft.format === "thai";

  const characters = useMemo(() => distinctNames([
    ...(project.characters ?? []).map(({ name }) => name),
    ...blocks.flatMap((block) => block.kind === "character" ? [block.text] : []),
  ]), [blocks, project.characters]);
  const { scenes: scriptScenes } = useMemo(() => splitScript(blocks), [blocks]);
  const locations = useMemo(() => distinctNames([
    ...(project.locations ?? []).map(({ name }) => name),
    ...scriptScenes.map(({ heading }) => sceneFields(heading).location),
  ]), [scriptScenes, project.locations]);
  const scenes = useMemo(() => scriptScenes.map(({ heading }, index) => {
    const scene = sceneFields(heading);
    return { id: heading.id, number: index + 1, title: scene.location.trim() ? sceneText(scene, draft.format) : "หัวฉากใหม่" };
  }), [scriptScenes, draft.format]);
  const currentScene = scriptScenes.find((scene) => scene.blocks.some((block) => block.id === active.id));
  const runtime = useMemo(() => estimateRuntime(draft.blocks), [draft.blocks]);

  useEffect(() => {
    if (!initialSceneId || speed) return;
    document.getElementById(`row-${initialSceneId}`)?.scrollIntoView({ block: "center" });
  }, [initialSceneId, Boolean(speed)]);

  function updateBlocks(change: (current: ScreenplayBlock[]) => ScreenplayBlock[]) {
    update((current) => ({
      ...current,
      blocks: change(current.blocks.length ? current.blocks : [starter]),
    }));
  }

  function patchBlock(id: string, change: (block: ScreenplayBlock) => ScreenplayBlock) {
    updateBlocks((current) => current.map((block) => block.id === id ? change(block) : block));
  }

  function setScene(id: string, changes: Partial<SceneHeading>) {
    patchBlock(id, (block) => {
      if (block.kind !== "sceneHeading") return block;
      const scene = { ...sceneFields(block), ...changes };
      return { ...block, scene, text: scene.location ? sceneText(scene) : "" };
    });
  }

  function focusField(id: string, field = "text", position?: number) {
    const control = document.getElementById(fieldId(id, field)) as TextControl | null;
    control?.focus();
    if (control && position !== undefined) control.setSelectionRange(position, position);
  }

  function editAndFocus(
    change: (current: ScreenplayBlock[]) => ScreenplayBlock[], id: string, field = "text", position?: number,
  ) {
    flushSync(() => {
      updateBlocks(change);
      setActiveId(id);
      setDrawer(false);
    });
    focusField(id, field, position);
  }

  function addKind(kind: TextBlockKind, reuseEmpty = true) {
    if (reuseEmpty && active.kind === kind && !hasBlockContent(active)) {
      if (drawer) flushSync(() => setDrawer(false));
      focusField(active.id);
      return;
    }
    if (reuseEmpty && active.kind !== "audioVisual" && !hasBlockContent(active)) {
      editAndFocus((current) => current.map((block) =>
        block.id === active.id ? { ...active, kind } : block,
      ), active.id, "text", 0);
      return;
    }
    const next = newTextBlock(kind);
    editAndFocus((current) => insertAfter(current, active.id, [next]), next.id, "text", 0);
  }

  function quickAction(action: TextBlockKind | "location") {
    if (action !== "location") return addKind(action);
    if (active.kind === "sceneHeading") return focusField(active.id);
    addKind("sceneHeading");
  }

  function addCharacter(name: string) {
    const dialogue = newTextBlock("dialogue");
    const alreadySelected = active.kind === "character" &&
      active.text.trim().toLocaleLowerCase("th") === name.toLocaleLowerCase("th");

    if (alreadySelected) {
      const following = blocks[blocks.indexOf(active) + 1];
      if (following?.kind === "dialogue") {
        if (drawer) flushSync(() => setDrawer(false));
        focusField(following.id);
      } else {
        editAndFocus((current) => insertAfter(current, active.id, [dialogue]), dialogue.id, "text", 0);
      }
      return;
    }

    const character = newTextBlock("character", name);
    editAndFocus((current) => {
      if (active.kind !== "audioVisual" && !hasBlockContent(active)) {
        return current.flatMap((block) => block.id === active.id
          ? [{ ...active, kind: "character", text: name }, dialogue]
          : [block]);
      }
      return insertAfter(current, active.id, [character, dialogue]);
    }, dialogue.id, "text", 0);
  }

  function selectScene(id: string) {
    setDrawer(false);
    setActiveId(id);
    document.getElementById(`row-${id}`)?.scrollIntoView({ block: "center" });
  }

  function openReferences(id: string) {
    setDrawer(false);
    setActiveId(id);
    const touch = window.matchMedia("(max-width: 1199px), (pointer: coarse) and (max-width: 1400px)");
    setReferences(touch.matches ? "drawer" : "panel");
  }

  function removeBlock(id: string) {
    const index = blocks.findIndex((block) => block.id === id);
    const next = blocks[index - 1] ?? blocks[index + 1] ?? newTextBlock("sceneHeading");
    editAndFocus((current) => {
      const remaining = current.filter((block) => block.id !== id);
      return remaining.length ? remaining : [next];
    }, next.id, next.kind === "audioVisual" ? "visual" : "text");
  }

  function editorKeys(event: KeyboardEvent<TextControl>, block: TextBlock) {
    if (isComposing(event) || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === "Escape") {
      event.preventDefault();
      formatRef.current?.focus();
      return;
    }
    if (event.key === "Tab") {
      event.preventDefault();
      const kind = cycleBlockKind(block.kind, event.shiftKey);
      const caret = event.currentTarget.selectionStart ?? 0;
      editAndFocus((current) => current.map((line) =>
        line.id === block.id ? { ...block, kind } : line,
      ), block.id, "text", caret);
      return;
    }
    if (event.key === "Backspace" && !hasBlockContent(block) && blocks.length > 1) {
      event.preventDefault();
      removeBlock(block.id);
      return;
    }
    if (event.key !== "Enter" || event.shiftKey) return;

    event.preventDefault();
    const { selectionStart, selectionEnd } = event.currentTarget;
    const canSplit = block.kind !== "sceneHeading" && block.kind !== "character" &&
      selectionStart !== null && selectionEnd !== null && selectionStart < block.text.length;
    const next = newTextBlock(enterKinds[block.kind], canSplit ? block.text.slice(selectionEnd) : "");
    editAndFocus((current) => current.flatMap((line) => line.id === block.id
      ? [canSplit ? { ...block, text: block.text.slice(0, selectionStart) } : line, next]
      : [line]), next.id, "text", 0);
  }

  function setFormat(format: ScreenplayFormat) {
    update((current) => ({ ...current, format }));
  }

  function setSpeedSession(changes: Partial<SpeedSession>) {
    setSpeedError("");
    update((current) => current.speedSession
      ? { ...current, speedSession: { ...current.speedSession, ...changes } }
      : current);
  }

  function enterSpeed() {
    const preceding = blocks.slice(0, blocks.indexOf(active) + 1).findLast((block) => block.kind === "character");
    update((current) => ({
      ...current,
      speedSession: {
        afterBlockId: current.blocks.length ? active.id : null,
        entries: [],
        characters: [],
        character: preceding?.kind === "character" ? preceding.text.trim() : characters[0] ?? "",
        kind: "dialogue",
        text: "",
      },
    }));
    window.scrollTo({ top: 0 });
  }

  function sendSpeedEntry() {
    if (!speed?.text.trim()) return;
    const entry = pendingSpeedEntry(speed);
    if (!entry) return setSpeedError("เลือกตัวละครหรือเพิ่มชื่อก่อนส่งข้อความ");
    setSpeedSession({ entries: [...speed.entries, entry], text: "", kind: "dialogue" });
  }

  function exitSpeed() {
    if (!speed) return;
    const pending = pendingSpeedEntry(speed);
    if (speed.text.trim() && !pending) return setSpeedError("เลือกตัวละครสำหรับข้อความที่กำลังพิมพ์ก่อนกลับไปหน้ากระดาษ");

    const converted = blocksFromSpeedEntries(pending ? [...speed.entries, pending] : speed.entries);
    const nextActive = converted.at(-1)?.id;
    flushSync(() => {
      update((current) => ({
        ...current,
        blocks: insertAfter(current.blocks, speed.afterBlockId, converted),
        speedSession: null,
      }));
      if (nextActive) setActiveId(nextActive);
    });
    if (nextActive) document.getElementById(`row-${nextActive}`)?.scrollIntoView({ block: "center" });
  }

  async function saveBeforeNavigation(event: MouseEvent<HTMLAnchorElement>) {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || status === "saved") return;
    const destination = event.currentTarget.href;
    event.preventDefault();
    if (await flush()) window.location.assign(destination);
  }

  const outline = (
    <SceneOutline scenes={scenes} onSelect={selectScene} onAdd={() => addKind("sceneHeading")} onDetails={openReferences} />
  );
  const tools = (
    <EditorTools names={characters} activeKind={active.kind} onKind={addKind} onCharacter={addCharacter}
      onDelete={() => {
        if (hasBlockContent(active)) { setDrawer(false); setDeleteId(active.id); }
        else if (blocks.length > 1) removeBlock(active.id);
      }} />
  );
  const formatSelect = (
    <div className="editor-format">
      <select ref={formatRef} aria-label="รูปแบบบท" value={draft.format}
        onChange={(event) => setFormat(event.target.value as ScreenplayFormat)}>
        {formats.map(([format, label]) => <option key={format} value={format}>{label}</option>)}
      </select>
      <ChevronsUpDown size={14} aria-hidden="true" />
    </div>
  );
  const quoteSwitch = (
    <button type="button" className="quote-switch" role="switch" aria-checked={dialogueQuotes}
      onClick={() => update((current) => ({ ...current, dialogueQuotes: !dialogueQuotes }))}>
      <Quote size={16} /> <span>คำพูดอัตโนมัติ</span><span className="switch-track" aria-hidden="true" />
    </button>
  );

  return (
    <div className="editor-shell" ref={shellRef} data-speed={!!speed}>
      <header className="editor-topbar">
        <div className="editor-title">
          <a href="/" className="icon-button editor-back" aria-label="กลับไปยังโปรเจกต์" onClick={saveBeforeNavigation}><ArrowLeft size={20} /></a>
          <span className="editor-title-icon"><Clapperboard size={19} /></span>
          <h1>{project.name}</h1>
        </div>
        <div className="editor-project-links">
          <a className="editor-timer" href={productionHref(project.id, "analytics")} onClick={saveBeforeNavigation}
            aria-label={`สถิติบท · ${runtime.pages} หน้า · ${runtime.minutes} นาทีโดยประมาณ`}>
            <Clock3 size={15} /> <span>{runtime.pages} หน้า · {runtime.minutes} นาทีโดยประมาณ</span>
          </a>
          <a className="secondary-button editor-planning" href={productionHref(project.id)} onClick={saveBeforeNavigation}>
            <LayoutGrid size={16} /> วางแผนเรื่อง
          </a>
        </div>
        <div className="editor-top-actions">
          <span className={`save-status save-${status}`} role="status">
            {status === "saved" ? <Check size={15} /> : status === "saving" ? <LoaderCircle size={15} /> : <CircleAlert size={15} />}
            <span>{saveLabels[status]}</span>
          </span>
          <button type="button" className="icon-button theme-button editor-theme" aria-label="สลับโหมดสี" onClick={onToggleTheme}>
            <Moon className="show-light" size={19} /><Sun className="show-dark" size={19} />
          </button>
          <button type="button" className="secondary-button editor-speed-switch" aria-label={speed ? "กลับไปหน้ากระดาษ" : "โหมดแชท"} onPointerDown={keepTypingFocus} onClick={speed ? exitSpeed : enterSpeed}>
            {speed ? <LayoutList size={16} /> : <MessageCircle size={16} />}
            <span>{speed ? "กลับไปหน้ากระดาษ" : "โหมดแชท"}</span>
          </button>
        </div>
      </header>

      {(status === "error" || status === "conflict") && (
        <div className="editor-save-warning" role="alert">
          <span>{status === "error" ? "การแก้ไขล่าสุดยังอยู่ในหน้านี้" : "ฉบับใน IndexedDB เปลี่ยนระหว่างที่คุณแก้ไข"}</span>
          <button type="button" className="secondary-button"
            onClick={status === "error" ? () => void flush() : () => setConfirmReload(true)}>
            {status === "error" ? "ลองบันทึกอีกครั้ง" : "โหลดฉบับล่าสุด"}
          </button>
        </div>
      )}

      <div className="editor-layout">
        <aside className="editor-panel editor-outline" aria-label="สารบัญฉาก">{!speed && outline}</aside>

        <main className="editor-main">
          {speed ? (
            <SpeedDialogue session={speed} names={characters} error={speedError} onChange={setSpeedSession} onSubmit={sendSpeedEntry} />
          ) : (
            <>
              <div className="paper-controls">
                {formatSelect}
                <div className="paper-actions">
                  {quoteSwitch}
                  <button type="button" className="icon-button editor-reference-toggle" disabled={!currentScene}
                    aria-label="ข้อมูลฉากปัจจุบัน" title="ข้อมูลฉากปัจจุบัน" aria-pressed={references !== null}
                    onClick={() => {
                      if (references) setReferences(null);
                      else if (currentScene) openReferences(currentScene.heading.id);
                    }}><BookOpen size={18} /></button>
                </div>
              </div>
              <section className={`script-paper paper-${draft.format}`} aria-label="หน้ากระดาษบทภาพยนตร์">
                <ScriptRows
                  blocks={blocks} scenes={scenes} characters={characters} locations={locations}
                  format={draft.format} dialogueQuotes={dialogueQuotes} activeId={active.id} onActivate={setActiveId}
                  onText={(id, text) => patchBlock(id, (block) => block.kind === "audioVisual" ? block : { ...block, text })}
                  onScene={setScene}
                  onColumn={(id, side, value) => patchBlock(id, (block) => ({ ...block, [side]: value }))}
                  onKeyDown={editorKeys}
                />
                <div className="paper-footer">
                  <button type="button" className="secondary-button" onPointerDown={keepTypingFocus} onClick={() => addKind("action", false)}>
                    <Plus size={16} /> เพิ่มบรรทัด
                  </button>
                  {draft.format === "two-column" && (
                    <button type="button" className="secondary-button" onPointerDown={keepTypingFocus} onClick={() => {
                      const row = { id: crypto.randomUUID(), kind: "audioVisual" as const, visual: "", audio: "" };
                      editAndFocus((current) => insertAfter(current, active.id, [row]), row.id, "visual");
                    }}><Plus size={16} /> เพิ่มแถวภาพ–เสียง</button>
                  )}
                </div>
              </section>
            </>
          )}
        </main>

        <aside className="editor-panel editor-tools" aria-label="เครื่องมือเขียนบท">
          {!speed && (references === "panel" && currentScene ? (
            <>
              <div className="editor-panel-heading scene-reference-panel-title">
                <h2>ข้อมูลฉาก</h2>
                <button type="button" className="icon-button" aria-label="ปิดข้อมูลฉาก" onClick={() => setReferences(null)}><X size={17} /></button>
              </div>
              <SceneReferences scene={currentScene} project={project} onNavigate={saveBeforeNavigation} />
            </>
          ) : tools)}
        </aside>
      </div>

      {!speed && <QuickActions onAction={quickAction} names={characters} onCharacter={addCharacter} />}
      <nav className="bottom-nav editor-bottom-nav" aria-label="เมนูตัวแก้ไขบท">
        <button type="button" className={!speed ? "bottom-active" : ""} aria-current={!speed ? "page" : undefined}
          onClick={speed ? exitSpeed : () => window.scrollTo({ top: 0 })}><LayoutList size={20} />หน้ากระดาษ</button>
        <button type="button" className={speed ? "bottom-active" : ""} aria-current={speed ? "page" : undefined}
          onClick={speed ? () => document.getElementById("speed-text")?.focus() : enterSpeed}><MessageCircle size={20} />โหมดแชท</button>
        <button type="button" onClick={() => setDrawer(true)}><Settings2 size={20} />เครื่องมือ</button>
      </nav>

      {drawer && (
        <Dialog title="เครื่องมือเขียนบท" drawer onClose={() => setDrawer(false)}>
          {speed ? <button type="button" className="secondary-button" onClick={onToggleTheme}>สลับโหมดสี</button> : (
            <div className="drawer-tools">{outline}{tools}</div>
          )}
        </Dialog>
      )}
      {references === "drawer" && currentScene && (
        <Dialog title="ข้อมูลฉาก" drawer onClose={() => setReferences(null)}>
          <SceneReferences scene={currentScene} project={project} onNavigate={saveBeforeNavigation} />
        </Dialog>
      )}
      {deleteId && (
        <Dialog title="ลบบรรทัดบท" onClose={() => setDeleteId(null)}>
          <p className="dialog-text">ลบ {active.kind === "audioVisual" ? "แถวภาพ–เสียง" : textBlockLabels[active.kind]} และข้อมูลในบรรทัดนี้หรือไม่?</p>
          <div className="dialog-actions">
            <button type="button" className="secondary-button" onClick={() => setDeleteId(null)}>ยกเลิก</button>
            <button type="button" className="danger-button" onClick={() => { const id = deleteId; setDeleteId(null); removeBlock(id); }}>ลบบรรทัด</button>
          </div>
        </Dialog>
      )}
      {confirmReload && (
        <Dialog title="โหลดฉบับล่าสุด" onClose={() => setConfirmReload(false)}>
          <p className="dialog-text">การแก้ไขในแท็บนี้ที่ยังไม่ได้บันทึกจะถูกแทนที่ด้วยฉบับล่าสุดใน IndexedDB</p>
          <div className="dialog-actions">
            <button type="button" className="secondary-button" onClick={() => setConfirmReload(false)}>ยกเลิก</button>
            <button type="button" className="primary-button" onClick={async () => {
              try {
                const latest = await getProject(project.id);
                if (latest) loadLatest(latest);
                setConfirmReload(false);
              } catch {
                setConfirmReload(false);
              }
            }}>โหลดฉบับล่าสุด</button>
          </div>
        </Dialog>
      )}
    </div>
  );
}
