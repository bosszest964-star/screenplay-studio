"use client";

import { Trash2 } from "lucide-react";
import type { KeyboardEvent } from "react";
import {
  sceneFields, sceneTimes, textBlockLabels, type SceneHeading, type ScreenplayBlock,
  type ScreenplayFormat, type TextBlock,
} from "@/lib/screenplay";
import { keepTypingFocus, ScriptTextarea, SuggestionInput } from "./fields";

export interface SceneIndex {
  id: string;
  number: number;
  title: string;
}

type TextControl = HTMLInputElement | HTMLTextAreaElement;

interface ScriptRowsProps {
  blocks: ScreenplayBlock[];
  scenes: SceneIndex[];
  characters: string[];
  locations: string[];
  format: ScreenplayFormat;
  dialogueQuotes: boolean;
  activeId: string;
  allSuggestionsId: string | null;
  onDismissSuggestions: (id: string) => void;
  onChooseLocation: (id: string, location: string) => void;
  onChooseCharacter: (id: string, name: string) => void;
  onActivate: (id: string) => void;
  onDelete?: (id: string) => void;
  onText: (id: string, text: string) => void;
  onScene: (id: string, fields: Partial<SceneHeading>) => void;
  onColumn: (id: string, side: "visual" | "audio", value: string) => void;
  onKeyDown: (event: KeyboardEvent<TextControl>, block: TextBlock) => void;
}

export function fieldId(id: string, field = "text") {
  return `screenplay-${id}-${field}`;
}

function sceneNumber(number: number) {
  return number.toString().padStart(2, "0");
}

const audioKinds = new Set(["character", "parenthetical", "dialogue"]);

function BlockText({
  block, characters, locations, format, dialogueQuotes, onText, onScene, onKeyDown,
  allSuggestionsId, onDismissSuggestions, onChooseLocation, onChooseCharacter,
}: Pick<ScriptRowsProps, "characters" | "locations" | "format" | "dialogueQuotes" | "onText" | "onScene" | "onKeyDown" |
  "allSuggestionsId" | "onDismissSuggestions" | "onChooseLocation" | "onChooseCharacter"> & { block: TextBlock }) {
  const id = fieldId(block.id);
  const setText = (value: string) => onText(block.id, value);
  const keyboard = (event: KeyboardEvent<TextControl>) => onKeyDown(event, block);

  if (block.kind === "sceneHeading") {
    const scene = sceneFields(block);

    return (
      <div className="scene-fields">
        <select
          aria-label="ภายใน / ภายนอก"
          title="ภายใน / ภายนอก"
          value={scene.setting}
          onChange={(event) => onScene(block.id, { setting: event.target.value as SceneHeading["setting"] })}
        >
          <option value="INT.">INT.</option>
          <option value="EXT.">EXT.</option>
        </select>
        <SuggestionInput
          id={id}
          label="สถานที่"
          value={scene.location}
          choices={locations}
          placeholder="สถานที่"
          showAll={allSuggestionsId === block.id}
          onDismiss={() => onDismissSuggestions(block.id)}
          onChange={(location) => onScene(block.id, { location })}
          onChoose={(location) => onChooseLocation(block.id, location)}
          onKeyDown={keyboard}
        />
        <span className="scene-dash" aria-hidden="true">–</span>
        <select
          aria-label="เวลาของฉาก"
          value={scene.time}
          onChange={(event) => onScene(block.id, { time: event.target.value as SceneHeading["time"] })}
        >
          {(Object.entries(sceneTimes)).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </select>
      </div>
    );
  }

  if (block.kind === "character") {
    return (
      <SuggestionInput
        id={id}
        label={textBlockLabels.character}
        value={block.text}
        choices={characters}
        placeholder="ชื่อตัวละคร"
        showAll={allSuggestionsId === block.id}
        onDismiss={() => onDismissSuggestions(block.id)}
        onChange={setText}
        onChoose={(name) => onChooseCharacter(block.id, name)}
        onKeyDown={keyboard}
      />
    );
  }

  const wrap = block.kind === "parenthetical" && !/^\([\s\S]*\)$/.test(block.text)
    ? ["(", ")"] as const
    : block.kind === "dialogue" && dialogueQuotes && !/^“[\s\S]*”$|^"[\s\S]*"$/.test(block.text)
      ? ["“", "”"] as const
      : undefined;

  return (
    <ScriptTextarea
      id={id}
      label={textBlockLabels[block.kind]}
      placeholder={block.kind === "transition" && format === "international" ? "CUT TO:" : textBlockLabels[block.kind]}
      value={block.text}
      onChange={setText}
      onKeyDown={keyboard}
      wrap={wrap}
    />
  );
}

export function ScriptRows({
  blocks, scenes, characters, locations, format, dialogueQuotes, activeId, onActivate,
  allSuggestionsId, onDismissSuggestions, onChooseLocation, onChooseCharacter,
  onDelete, onText, onScene, onColumn, onKeyDown,
}: ScriptRowsProps) {
  const table = format === "two-column";
  const sceneNumbers = new Map(scenes.map(({ id, number }) => [id, number]));

  return (
    <div className={table ? "script-rows script-table" : "script-rows"} role={table ? "table" : undefined} aria-label="บทภาพยนตร์">
      {table && <div className="script-table-head" role="row"><span role="columnheader">ภาพ</span><span role="columnheader">เสียง</span></div>}
      {blocks.map((block) => {
        const number = sceneNumbers.get(block.id);
        const type = block.kind === "audioVisual" ? "ภาพและเสียง" : textBlockLabels[block.kind];
        const selected = activeId === block.id;
        const rowClass = `script-row line-${block.kind}${selected ? " active-line" : ""}`;
        const deleteLabel = number === undefined ? `ลบบรรทัด ${type}` : `ลบหัวฉาก ${number}`;
        const deleteButton = onDelete && (
          <button
            type="button"
            className="icon-button script-delete"
            aria-label={deleteLabel}
            title={deleteLabel}
            onPointerDown={keepTypingFocus}
            onClick={(event) => {
              event.stopPropagation();
              onDelete(block.id);
            }}
          >
            <Trash2 size={16} />
          </button>
        );
        const text = block.kind !== "audioVisual" && (
          <BlockText {...{ block, characters, locations, format, dialogueQuotes, onText, onScene, onKeyDown,
            allSuggestionsId, onDismissSuggestions, onChooseLocation, onChooseCharacter }} />
        );
        const column = (side: "visual" | "audio") => {
          const label = side === "visual" ? "ภาพ" : "เสียง";
          return (
            <ScriptTextarea
              id={fieldId(block.id, side)}
              label={label}
              placeholder={`ระบุ${label}`}
              value={block[side] ?? ""}
              onChange={(value) => onColumn(block.id, side, value)}
            />
          );
        };
        const tag = (
          <span className="line-label">
            {number !== undefined && <span className="scene-number font-mono" aria-label={`ฉาก ${number}`}>{sceneNumber(number)}</span>}
            {type}
          </span>
        );

        if (table) {
          const sideOfText = audioKinds.has(block.kind) ? "audio" : "visual";
          const cell = (side: "visual" | "audio") => {
            if (!text || side !== sideOfText) return column(side);
            return <>{tag}{text}{block[side] !== undefined && column(side)}</>;
          };
          return (
            <div
              key={block.id} id={`row-${block.id}`} className={rowClass} role="row" tabIndex={-1}
              onFocus={() => onActivate(block.id)}
              onClick={() => onActivate(block.id)}
            >
              <div className="script-cell" role="cell">{cell("visual")}</div>
              <div className="script-cell" role="cell">{cell("audio")}{deleteButton}</div>
            </div>
          );
        }

        return (
          <div
            key={block.id} id={`row-${block.id}`} className={rowClass} tabIndex={-1}
            onFocus={() => onActivate(block.id)}
            onClick={() => onActivate(block.id)}
          >
            {tag}
            <div className="script-line-content">
              {text && <div className="script-text">{text}</div>}
              {(block.kind === "audioVisual" || block.visual !== undefined || block.audio !== undefined) && (
                <div className="inline-av">
                  {(block.kind === "audioVisual" || block.visual !== undefined) && <label>ภาพ{column("visual")}</label>}
                  {(block.kind === "audioVisual" || block.audio !== undefined) && <label>เสียง{column("audio")}</label>}
                </div>
              )}
            </div>
            {deleteButton}
          </div>
        );
      })}
    </div>
  );
}
