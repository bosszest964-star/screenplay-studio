"use client";

import { useEffect, type RefObject } from "react";

export function useKeyboardInset(shell: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const root = shell.current;
    const viewport = window.visualViewport;
    if (!root || !viewport) return;

    const touch = window.matchMedia("(max-width: 1199px), (pointer: coarse) and (max-width: 1400px)");
    const observer = new MutationObserver(schedule);
    let field: HTMLElement | null = null;
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

      const suggestionField = typing ? editor.closest<HTMLElement>(".suggestion-field") : null;
      if (suggestionField !== field) {
        observer.disconnect();
        field = suggestionField;
        if (field) observer.observe(field, { childList: true, subtree: true });
      }
      const suggestions = field?.querySelector<HTMLElement>(".suggestion-list");
      if (touch.matches && (keyboardOpen || suggestions) && editor instanceof HTMLElement && editor.closest(".script-paper")) {
        const toolbar = root.querySelector(".editor-quickbar");
        if (!toolbar) return;
        const toolbarTop = toolbar.getBoundingClientRect().top;
        const headerBottom = root.querySelector(".editor-topbar")?.getBoundingClientRect().bottom ?? 0;
        const top = Math.max(viewport.offsetTop, headerBottom) + 6;
        const bottom = Math.min(viewport.offsetTop + viewport.height, toolbarTop) - 10;
        const box = editor.getBoundingClientRect();
        if (box.bottom > bottom && box.height < bottom - top) {
          window.scrollBy({ top: box.bottom - bottom, behavior: "instant" });
        }
        if (suggestions) {
          const position = editor.getBoundingClientRect();
          const roomBelow = bottom - position.bottom - 3;
          const roomAbove = position.top - top - 3;
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
      observer.disconnect();
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
