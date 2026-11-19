"use client";

import {
  ArrowRightToLine, BookOpen, Clapperboard, MapPin, Parentheses, Plus, Quote, TextAlignStart, UserRound,
} from "lucide-react";
import type { TextBlockKind } from "@/lib/screenplay";
import { textBlockLabels } from "@/lib/screenplay";
import { keepTypingFocus } from "./fields";
import type { SceneIndex } from "./script-rows";

const kindIcons = {
  sceneHeading: Clapperboard,
  action: TextAlignStart,
  character: UserRound,
  dialogue: Quote,
  parenthetical: Parentheses,
  transition: ArrowRightToLine,
};

const quickActions: Array<{ key: TextBlockKind | "location"; label: string }> = [
  { key: "sceneHeading", label: "หัวฉาก" },
  { key: "location", label: "สถานที่" },
  { key: "character", label: "ตัวละคร" },
  { key: "dialogue", label: "“บทพูด”" },
  { key: "parenthetical", label: "(อารมณ์)" },
  { key: "transition", label: "เปลี่ยนฉาก" },
  { key: "action", label: "บรรยายภาพ" },
];

export function SceneOutline({ scenes, onSelect, onAdd, onDetails }: {
  scenes: SceneIndex[];
  onSelect: (id: string) => void;
  onAdd: () => void;
  onDetails: (id: string) => void;
}) {
  return (
    <>
      <div className="editor-panel-heading"><h2>ฉาก</h2><span className="font-mono">{scenes.length}</span></div>
      {scenes.length > 0 && (
        <ol className="scene-outline">
          {scenes.map(({ id, title, number }) => (
            <li key={id}>
              <button type="button" onClick={() => onSelect(id)}>
                <span className="font-mono">{String(number).padStart(2, "0")}</span>
                <span>{title}</span>
              </button>
              <button type="button" className="scene-ref-button" aria-label={`ดูข้อมูลฉาก ${number}`} onClick={() => onDetails(id)}>
                <BookOpen size={15} />
              </button>
            </li>
          ))}
        </ol>
      )}
      <button type="button" className="secondary-button outline-add" onClick={onAdd}><Plus size={16} />เพิ่มหัวฉาก</button>
    </>
  );
}

export function CharacterChips({ names, onSelect, current, onAdd }: {
  names: string[];
  onSelect: (name: string) => void;
  current?: string;
  onAdd?: () => void;
}) {
  return (
    <div className="character-chips" aria-label="ตัวละครด่วน">
      {names.map((name) => (
        <button
          key={name}
          type="button"
          aria-pressed={onAdd ? name === current : undefined}
          onPointerDown={keepTypingFocus}
          onClick={() => onSelect(name)}
        >{name}</button>
      ))}
      {onAdd && (
        <button type="button" className="add-character" onPointerDown={keepTypingFocus} onClick={onAdd}>
          <Plus size={15} /> เพิ่มชื่อ
        </button>
      )}
    </div>
  );
}

export function EditorTools({ activeKind, names, onKind, onCharacter }: {
  activeKind: string;
  names: string[];
  onKind: (kind: TextBlockKind) => void;
  onCharacter: (name: string) => void;
}) {
  return (
    <>
      <div className="editor-panel-heading"><h2>ประเภทบรรทัด</h2></div>
      <div className="line-types">
        {(Object.entries(textBlockLabels) as [TextBlockKind, string][]).map(([kind, label]) => {
          const Icon = kindIcons[kind];
          return (
            <button type="button" key={kind} data-current={activeKind === kind} onClick={() => onKind(kind)}>
              <Icon size={17} /> {label}
            </button>
          );
        })}
      </div>
      {names.length > 0 && (
        <>
          <div className="editor-panel-heading cast-heading"><h2>ตัวละคร</h2></div>
          <CharacterChips names={names} onSelect={onCharacter} />
        </>
      )}
      <div className="key-guide"><kbd>Enter</kbd> ขึ้นบรรทัด <kbd>Tab</kbd> เปลี่ยนประเภท <kbd>Esc</kbd> ออกจากบรรทัด</div>
    </>
  );
}

export function QuickActions({ onAction, names, onCharacter }: {
  onAction: (action: TextBlockKind | "location") => void;
  names: string[];
  onCharacter: (name: string) => void;
}) {
  return (
    <div className="editor-quickbar" aria-label="ปุ่มลัดสำหรับเขียนบท">
      {names.length > 0 && <CharacterChips names={names} onSelect={onCharacter} />}
      <div className="quick-actions">
        {quickActions.map(({ key, label }) => {
          const Icon = key === "location" ? MapPin : kindIcons[key];
          return (
            <button type="button" key={key} onPointerDown={keepTypingFocus} onClick={() => onAction(key)}>
              <Icon size={17} />{label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
