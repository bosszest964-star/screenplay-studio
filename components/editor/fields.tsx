"use client";

import { useId, useState, type KeyboardEvent, type PointerEvent } from "react";

export function isComposing(event: KeyboardEvent<HTMLElement>) {
  return event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229;
}

export function keepTypingFocus(event: PointerEvent) {
  if (document.activeElement instanceof HTMLInputElement ||
      document.activeElement instanceof HTMLTextAreaElement) event.preventDefault();
}

interface TextAreaProps {
  id: string;
  label: string;
  value: string;
  placeholder?: string;
  wrap?: readonly [string, string];
  onChange: (value: string) => void;
  onKeyDown?: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
}

export function ScriptTextarea({ id, label, value, placeholder, wrap, onChange, onKeyDown }: TextAreaProps) {
  return (
    <div className={wrap ? "script-field wrapped-field" : "script-field"}>
      {wrap && <span className="script-wrapper" aria-hidden="true">{wrap[0]}</span>}
      <div className="growing-field">
        <div className="field-measure" aria-hidden="true">
          {value}<span>{wrap?.[1] ?? "\u200b"}</span>
        </div>
        <textarea
          id={id}
          aria-label={label}
          rows={1}
          value={value}
          placeholder={wrap ? undefined : placeholder}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={onKeyDown}
        />
      </div>
    </div>
  );
}

interface SuggestionInputProps {
  id: string;
  label: string;
  value: string;
  choices: string[];
  placeholder: string;
  onChange: (value: string) => void;
  onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  onChoose?: () => void;
}

export function SuggestionInput({
  id, label, value, choices, placeholder, onChange, onKeyDown, onChoose,
}: SuggestionInputProps) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const query = value.trim().toLocaleLowerCase("th");
  const matches = choices.filter((choice) => {
    const normalized = choice.toLocaleLowerCase("th");
    return normalized !== query && normalized.includes(query);
  }).slice(0, 7);
  const visible = open && matches.length > 0;

  function select(choice: string) {
    onChange(choice);
    setOpen(false);
    setActive(-1);
    onChoose?.();
  }

  function keyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (isComposing(event)) return;
    if (matches.length && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
      event.preventDefault();
      setOpen(true);
      const next = event.key === "ArrowDown" ? active + 1 : active < 0 ? matches.length - 1 : active - 1;
      setActive((next + matches.length) % matches.length);
      return;
    }
    if (visible && event.key === "Enter" && matches[active]) {
      event.preventDefault();
      select(matches[active]);
      return;
    }
    if (visible && event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      setActive(-1);
      return;
    }
    onKeyDown(event);
  }

  return (
    <div className="suggestion-field" data-measure={value || placeholder}>
      <input
        id={id}
        type="text"
        role="combobox"
        aria-label={label}
        aria-expanded={visible}
        aria-autocomplete="list"
        aria-controls={visible ? listId : undefined}
        aria-activedescendant={visible && matches[active] ? `${listId}-${active}` : undefined}
        autoComplete="off"
        value={value}
        placeholder={placeholder}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
        onBlur={() => { setOpen(false); setActive(-1); }}
        onChange={(event) => { onChange(event.target.value); setOpen(true); setActive(-1); }}
        onKeyDown={keyDown}
      />
      {visible && (
        <div className="suggestion-list" id={listId} role="listbox" aria-label={label}>
          {matches.map((choice, index) => (
            <div
              key={choice}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={index === active}
              onPointerDown={keepTypingFocus}
              onClick={() => select(choice)}
            >
              {choice}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
