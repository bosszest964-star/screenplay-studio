"use client";

import { CornerDownLeft, MessageCircle, Parentheses, Send, TextAlignStart } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Dialog } from "@/components/dialog";
import { distinctNames, type SpeedEntryKind, type SpeedSession } from "@/lib/screenplay";
import { CharacterChips } from "./editor-tools";
import { isComposing, keepTypingFocus } from "./fields";

const composerModes = {
  dialogue: { label: "บทพูด", icon: MessageCircle, placeholder: "พิมพ์บทพูด…" },
  action: { label: "บรรยายภาพ", icon: TextAlignStart, placeholder: "พิมพ์บรรยายภาพ…" },
  parenthetical: { label: "อารมณ์", icon: Parentheses, placeholder: "พิมพ์วงเล็บอารมณ์…" },
} as const;

export function SpeedDialogue({ session, names, error, onChange, onSubmit }: {
  session: SpeedSession;
  names: string[];
  error: string;
  onChange: (changes: Partial<SpeedSession>) => void;
  onSubmit: () => void;
}) {
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const lastEntry = useRef<HTMLDivElement>(null);
  const [addingName, setAddingName] = useState(false);
  const [name, setName] = useState("");
  const characters = distinctNames([...names, ...session.characters]);
  const lastId = session.entries.at(-1)?.id;

  useEffect(() => {
    lastEntry.current?.scrollIntoView({ block: "nearest" });
  }, [lastId]);

  function submitName(event: FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    const character = characters.find((entry) => entry.toLocaleLowerCase("th") === trimmed.toLocaleLowerCase("th")) ?? trimmed;
    onChange({ characters: distinctNames([...session.characters, character]), character });
    setAddingName(false);
  }

  return (
    <section className="speed-chat" aria-labelledby="speed-heading">
      <header className="speed-heading">
        <span className="speed-icon"><MessageCircle size={22} /></span>
        <div><h2 id="speed-heading">เขียนบทแบบแชท</h2><p>เลือกตัวละครแล้วส่งบทพูด เมื่อกลับไปหน้ากระดาษ ข้อความจะรวมเข้ากับบท</p></div>
      </header>

      <div className="speed-transcript" role="log" aria-label="ข้อความโหมดแชท">
        {session.entries.length === 0 && (
          <div className="chat-empty">
            <MessageCircle size={30} strokeWidth={1.4} />
            <p>เริ่มด้วยบทพูดหรือบรรยายภาพ</p>
          </div>
        )}
        {session.entries.map((entry) => {
          const speaker = characters.indexOf(entry.character);
          return (
            <div key={entry.id} className={`chat-entry chat-${entry.kind}`} data-alternate={speaker % 2 === 1}>
              <span>{entry.kind === "action" ? "บรรยายภาพ" : entry.character}</span>
              <p>{entry.kind === "parenthetical" ? `(${entry.text})` : entry.text}</p>
            </div>
          );
        })}
        <div ref={lastEntry} className="chat-end" />
      </div>

      <form className="speed-composer" onSubmit={(event) => { event.preventDefault(); onSubmit(); }}>
        <CharacterChips
          names={characters}
          current={session.character}
          onSelect={(character) => {
            onChange({ character, kind: "dialogue" });
            composerRef.current?.focus();
          }}
          onAdd={() => { setName(""); setAddingName(true); }}
        />
        <div className="composer-modes" role="group" aria-label="ประเภทข้อความ">
          {(Object.entries(composerModes) as [SpeedEntryKind, (typeof composerModes)[SpeedEntryKind]][]).map(
            ([kind, { label, icon: Icon }]) => (
              <button type="button" key={kind} aria-pressed={session.kind === kind} onPointerDown={keepTypingFocus}
                onClick={() => { onChange({ kind }); composerRef.current?.focus(); }}>
                <Icon size={15} />{label}
              </button>
            ),
          )}
        </div>
        <div className="composer-field">
          <textarea
            id="speed-text"
            ref={composerRef}
            aria-label="ข้อความโหมดแชท"
            placeholder={composerModes[session.kind].placeholder}
            rows={2}
            value={session.text}
            onChange={(event) => onChange({ text: event.target.value })}
            onKeyDown={(event) => {
              if (!isComposing(event) && event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                onSubmit();
              }
            }}
          />
          <button type="submit" className="primary-button" aria-label="ส่งข้อความ" title="ส่งข้อความ" onPointerDown={keepTypingFocus}>
            <Send size={18} />
          </button>
        </div>
        {error ? <p role="alert" className="form-error">{error}</p> : (
          <span className="composer-hint"><CornerDownLeft size={13} /> Enter เพื่อส่ง</span>
        )}
      </form>

      {addingName && (
        <Dialog title="เพิ่มตัวละคร" onClose={() => setAddingName(false)}>
          <form onSubmit={submitName}>
            <label className="name-field">ชื่อตัวละคร
              <input required maxLength={100} data-initial-focus value={name} onChange={(event) => setName(event.target.value)} />
            </label>
            <div className="dialog-actions">
              <button type="button" className="secondary-button" onClick={() => setAddingName(false)}>ยกเลิก</button>
              <button className="primary-button" type="submit">เพิ่มชื่อ</button>
            </div>
          </form>
        </Dialog>
      )}
    </section>
  );
}
