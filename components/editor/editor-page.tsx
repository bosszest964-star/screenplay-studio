"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { ArrowLeft, Clapperboard } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { usePwa } from "@/components/use-pwa";
import { useTheme } from "@/components/use-theme";
import { getProject } from "@/lib/projects";
import { ScreenplayEditor } from "./screenplay-editor";
import "./editor.css";

function EditorPlaceholder({ message = "กำลังเปิดโปรเจกต์…", onRetry }: {
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <main className="editor-placeholder">
      <span className="brand-mark"><Clapperboard size={22} /></span>
      <h1>{message}</h1>
      {onRetry && <button type="button" className="primary-button" onClick={onRetry}>ลองอีกครั้ง</button>}
      <a href="/" className="secondary-button"><ArrowLeft size={16} /> กลับไปยังโปรเจกต์</a>
    </main>
  );
}

function ProjectEditorRoute({ toggleTheme }: { toggleTheme: () => void }) {
  const search = useSearchParams();
  const id = search.get("project");
  const [attempt, setAttempt] = useState(0);
  const result = useLiveQuery(async () => {
    try {
      return { project: id ? await getProject(id) : undefined, error: false };
    } catch {
      return { project: undefined, error: true };
    }
  }, [id, attempt]);

  if (!result) return <EditorPlaceholder />;
  if (result.error) return <EditorPlaceholder message="เปิดโปรเจกต์ไม่ได้" onRetry={() => setAttempt((current) => current + 1)} />;
  if (!result.project) return <EditorPlaceholder message="ไม่พบโปรเจกต์" />;
  return <ScreenplayEditor key={result.project.id} project={result.project} initialSceneId={search.get("scene")} onToggleTheme={toggleTheme} />;
}

export function EditorPage() {
  const toggleTheme = useTheme();
  usePwa();
  return (
    <Suspense fallback={<EditorPlaceholder />}>
      <ProjectEditorRoute toggleTheme={toggleTheme} />
    </Suspense>
  );
}
