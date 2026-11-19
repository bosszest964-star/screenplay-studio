"use client";

import { X } from "lucide-react";
import { useEffect, useId, useRef, type ReactNode } from "react";

interface DialogProps {
  title: string;
  children: ReactNode;
  onClose: () => void;
  drawer?: boolean;
  busy?: boolean;
}

export function Dialog({ title, children, onClose, drawer, busy }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    dialog?.querySelector<HTMLElement>("[data-initial-focus]")?.focus();
    return () => dialog?.close();
  }, []);

  return (
    <dialog
      ref={ref}
      className={drawer ? "dialog dialog-drawer" : "dialog"}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget && !busy) {
          const rect = event.currentTarget.getBoundingClientRect();
          if (event.clientX < rect.left || event.clientX > rect.right ||
              event.clientY < rect.top || event.clientY > rect.bottom) onClose();
        }
      }}
    >
      <header className="dialog-header">
        <h2 id={titleId}>{title}</h2>
        <button type="button" className="icon-button" aria-label="ปิด" onClick={onClose} disabled={busy}>
          <X size={20} />
        </button>
      </header>
      {children}
    </dialog>
  );
}
