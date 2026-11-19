"use client";

import { useEffect, useRef, useState } from "react";
import { DraftConflict, saveProjectDraft } from "@/lib/projects";
import type { EditorDraft, Project } from "@/lib/screenplay";

type SaveStatus = "saved" | "saving" | "error" | "conflict";

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

  function loadLatest(latest: Project) {
    const next = projectDraft(latest);
    const current = queue.current;
    current.revision = latest.editorRevision ?? 0;
    current.draft = next;
    current.persisted = next;
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

  function update(change: (draft: EditorDraft) => EditorDraft) {
    const current = queue.current;
    const next = change(current.draft);
    if (next === current.draft) return;
    current.draft = next;
    setDraft(next);
    if (status !== "conflict") void flush();
  }

  return { draft, status, update, flush, loadLatest };
}
