"use client";

import { useEffect, type RefObject } from "react";

export function useKeyboardInset(shell: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const root = shell.current;
    const viewport = window.visualViewport;
    if (!root || !viewport) return;

    const touch = window.matchMedia("(max-width: 1199px), (pointer: coarse) and (max-width: 1400px)");
    let frame = 0;

    function measure() {
      if (!root || !viewport) return;
      const editor = document.activeElement;
      const typing = (editor instanceof HTMLTextAreaElement ||
        (editor instanceof HTMLInputElement && ["text", "search"].includes(editor.type))) &&
        root.contains(editor);
      const layoutHeight = document.documentElement.clientHeight;
      const keyboardOpen = touch.matches && typing && viewport.scale < 1.1 &&
        layoutHeight - viewport.height > 85;
      const inset = keyboardOpen ? Math.max(0, layoutHeight - viewport.height - viewport.offsetTop) : 0;

      root.toggleAttribute("data-keyboard-open", keyboardOpen);
      root.style.setProperty("--keyboard-inset", `${Math.round(inset)}px`);

      const suggestions = editor?.parentElement?.querySelector<HTMLElement>(".suggestion-list");
      if (keyboardOpen && editor instanceof HTMLElement && editor.closest(".script-paper")) {
        const toolbar = root.querySelector(".editor-quickbar");
        if (!toolbar) return;
        const toolbarHeight = toolbar.getBoundingClientRect().height;
        const bottom = viewport.offsetTop + viewport.height - toolbarHeight - 10;
        const box = editor.getBoundingClientRect();
        if (box.bottom > bottom && box.height < viewport.height - toolbarHeight) {
          window.scrollBy({ top: box.bottom - bottom, behavior: "instant" });
        }
        if (suggestions) {
          const position = editor.getBoundingClientRect();
          const roomBelow = bottom - position.bottom;
          const roomAbove = position.top - viewport.offsetTop - 6;
          const above = roomBelow < Math.min(suggestions.scrollHeight, 180) && roomAbove > roomBelow;
          suggestions.toggleAttribute("data-above", above);
          suggestions.style.maxHeight = `${Math.max(38, Math.min(180, above ? roomAbove : roomBelow))}px`;
        }
      } else if (suggestions) {
        suggestions.removeAttribute("data-above");
        suggestions.style.removeProperty("max-height");
      }
    }

    function schedule() {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    }

    viewport.addEventListener("resize", schedule);
    viewport.addEventListener("scroll", schedule);
    window.addEventListener("resize", schedule);
    document.addEventListener("focusin", schedule);
    document.addEventListener("focusout", schedule);
    document.addEventListener("input", schedule);
    touch.addEventListener("change", schedule);
    measure();

    return () => {
      cancelAnimationFrame(frame);
      viewport.removeEventListener("resize", schedule);
      viewport.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      document.removeEventListener("focusin", schedule);
      document.removeEventListener("focusout", schedule);
      document.removeEventListener("input", schedule);
      touch.removeEventListener("change", schedule);
    };
  }, [shell]);
}
