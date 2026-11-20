"use client";

import { useId, useState, type KeyboardEvent, type MouseEvent, type PointerEvent } from "react";

export function isComposing(event: KeyboardEvent<HTMLElement>) {
  return event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229;
}

export function keepTypingFocus(event: PointerEvent) {
  if (document.activeElement instanceof HTMLInputElement ||
      document.activeElement instanceof HTMLTextAreaElement) event.preventDefault();
}

export function pressBeforeBlur(activate: () => void) {
  return {
    onPointerDown(event: PointerEvent<HTMLElement>) {
      if (!event.isPrimary || event.button !== 0) return;
      event.preventDefault();
      if (event.pointerType === "mouse") activate();
    },
    onPointerUp(event: PointerEvent<HTMLElement>) {
      if (!event.isPrimary || event.pointerType === "mouse" || event.button !== 0) return;
      // Scrolling a touch list cancels the pointer. A tap can commit before the synthetic click.
      if (event.currentTarget.contains(document.elementFromPoint(event.clientX, event.clientY))) activate();
    },
    onClick(event: MouseEvent<HTMLElement>) {
      event.stopPropagation();
      if (event.detail === 0) activate();
    },
  };
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
  showAll: boolean;
  onDismiss: () => void;
  onChange: (value: string) => void;
  onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  onChoose: (value: string) => void;
}

export function SuggestionInput({
  id, label, value, choices, placeholder, showAll, onDismiss, onChange, onKeyDown, onChoose,
}: SuggestionInputProps) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const query = value.trim().toLocaleLowerCase("th");
  const matches = showAll ? choices : choices.filter((choice) => {
    const normalized = choice.toLocaleLowerCase("th");
    return normalized !== query && normalized.includes(query);
  }).slice(0, 7);
  const visible = (showAll || open) && matches.length > 0;

  function dismiss() {
    setOpen(false);
    setActive(-1);
    if (showAll) onDismiss();
  }

  function select(choice: string) {
    dismiss();
    onChoose(choice);
  }

  function keyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (isComposing(event)) return;
    if (matches.length && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
      event.preventDefault();
      setOpen(true);
      const next = event.key === "ArrowDown" ? active + 1 : active < 0 ? matches.length - 1 : active - 1;
      const index = (next + matches.length) % matches.length;
      setActive(index);
      document.getElementById(`${listId}-${index}`)?.scrollIntoView({ block: "nearest" });
      return;
    }
    if (visible && event.key === "Enter" && matches[active]) {
      event.preventDefault();
      select(matches[active]);
      return;
    }
    if ((visible || showAll) && event.key === "Escape") {
      event.preventDefault();
      dismiss();
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
        onBlur={dismiss}
        onChange={(event) => {
          if (showAll) onDismiss();
          onChange(event.target.value);
          setOpen(true);
          setActive(-1);
        }}
        onKeyDown={keyDown}
      />
      {visible && (
        <div className="suggestion-list" id={listId} role="listbox" aria-label={label}>
          {matches.map((choice, index) => (
            <button
              key={choice}
              id={`${listId}-${index}`}
              type="button"
              role="option"
              tabIndex={-1}
              aria-selected={index === active}
              {...pressBeforeBlur(() => select(choice))}
            >
              {choice}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
