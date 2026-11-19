"use client";

import { useEffect, useRef, useState } from "react";
import { DraftConflict, saveProjectDraft } from "@/lib/projects";
import type { EditorDraft, Project } from "@/lib/screenplay";

type SaveStatus = "saved" | "saving" | "error" | "conflict";
type DraftContent = Pick<EditorDraft, "blocks" | "speedSession">;

const historyLimit = 100;
const typingInterval = 750;

function projectDraft(project: Project): EditorDraft {
  return {
    blocks: project.blocks,
    format: project.format,
    dialogueQuotes: project.dialogueQuotes,
    speedSession: project.speedSession ?? null,
  };
}

export function useProjectDraft(project: Project) {
  const [draft, setDraft] = useState(() => projectDraft(project));
  const [status, setStatus] = useState<SaveStatus>("saved");
  const queue = useRef({
    revision: project.editorRevision ?? 0,
    draft,
    persisted: draft,
    running: null as Promise<boolean> | null,
  });
  const history = useRef({
    undo: [] as DraftContent[],
    redo: [] as DraftContent[],
    typing: null as { field: string; at: number } | null,
  });

  function loadLatest(latest: Project) {
    const next = projectDraft(latest);
    const current = queue.current;
    current.revision = latest.editorRevision ?? 0;
    current.draft = next;
    current.persisted = next;
    history.current = { undo: [], redo: [], typing: null };
    setDraft(next);
    setStatus("saved");
  }

  useEffect(() => {
    const current = queue.current;
    if ((project.editorRevision ?? 0) > current.revision &&
        current.draft === current.persisted && !current.running) {
      loadLatest(project);
    }
  }, [project, status]);

  useEffect(() => {
    const warnUnsaved = (event: BeforeUnloadEvent) => {
      if (queue.current.draft !== queue.current.persisted) {
        event.preventDefault();
        event.returnValue = true;
      }
    };
    window.addEventListener("beforeunload", warnUnsaved);
    return () => window.removeEventListener("beforeunload", warnUnsaved);
  }, []);

  function flush(): Promise<boolean> {
    const current = queue.current;
    if (current.running) return current.running;
    if (current.draft === current.persisted) return Promise.resolve(true);

    setStatus("saving");
    current.running = (async () => {
      try {
        while (current.draft !== current.persisted) {
          const snapshot = current.draft;
          current.revision = await saveProjectDraft(project.id, current.revision, snapshot);
          current.persisted = snapshot;
        }
        setStatus("saved");
        return true;
      } catch (error) {
        setStatus(error instanceof DraftConflict ? "conflict" : "error");
        return false;
      } finally {
        current.running = null;
      }
    })();
    return current.running;
  }

  function commit(next: EditorDraft) {
    queue.current.draft = next;
    setDraft(next);
    if (status !== "conflict") void flush();
  }

  function update(change: (draft: EditorDraft) => EditorDraft, typingField?: string) {
    const current = queue.current.draft;
    const next = change(current);
    if (next === current) return;

    const edits = history.current;
    if (next.blocks !== current.blocks || next.speedSession !== current.speedSession) {
      const now = Date.now();
      const previous = edits.typing;
      if (!previous || previous.field !== typingField || now - previous.at > typingInterval) {
        edits.undo.push(current);
        if (edits.undo.length > historyLimit) edits.undo.shift();
      }
      edits.redo.length = 0;
      edits.typing = typingField ? { field: typingField, at: now } : null;
    } else {
      edits.typing = null;
    }

    commit(next);
  }

  function restore(direction: "undo" | "redo") {
    const edits = history.current;
    const snapshot = edits[direction].pop();
    if (!snapshot) return;
    const current = queue.current.draft;
    edits[direction === "undo" ? "redo" : "undo"].push(current);
    edits.typing = null;
    const next = { ...current, blocks: snapshot.blocks, speedSession: snapshot.speedSession };
    commit(next);
    return next;
  }

  return {
    draft, status, update, flush, loadLatest, restore,
    canUndo: history.current.undo.length > 0,
    canRedo: history.current.redo.length > 0,
  };
}
