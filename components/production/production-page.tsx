"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { ArrowLeft, ChartColumn, Clapperboard, FileText, LayoutGrid, MapPin, Menu, Moon, Sun, UserRound } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Dialog } from "@/components/dialog";
import { usePwa } from "@/components/use-pwa";
import { useTheme } from "@/components/use-theme";
import { getProject } from "@/lib/projects";
import { productionHref, productionViews, type ProductionView } from "@/lib/production";
import { editorHref, type Project } from "@/lib/screenplay";
import { ScriptAnalytics } from "./analytics";
import { BeatBoard } from "./beat-board";
import { ReferenceManager } from "./reference-manager";
import "./production.css";

const views = Object.keys(productionViews) as ProductionView[];
const viewIcons = { board: LayoutGrid, characters: UserRound, locations: MapPin, analytics: ChartColumn };

function ProductionNav({ projectId, view }: { projectId: string; view: ProductionView }) {
  return (
    <nav className="side-nav" aria-label="เครื่องมือโปรเจกต์">
      <a className="nav-item" href={editorHref(projectId)}><FileText size={19} /> เขียนบท</a>
      {views.map((key) => {
        const Icon = viewIcons[key];
        return (
          <a className={`nav-item${key === view ? " active" : ""}`} key={key}
            href={productionHref(projectId, key)} aria-current={key === view ? "page" : undefined}>
            <Icon size={19} /> {productionViews[key]}
          </a>
        );
      })}
    </nav>
  );
}

function Workspace({ project, view, initialReference, toggleTheme }: {
  project: Project;
  view: ProductionView;
  initialReference: string | null;
  toggleTheme: () => void;
}) {
  const [showMenu, setShowMenu] = useState(false);
  return (
    <div className="production-shell">
      <header className="production-topbar">
        <div className="production-project">
          <a className="icon-button" href="/" aria-label="กลับไปยังโปรเจกต์"><ArrowLeft size={20} /></a>
          <span className="brand-mark"><Clapperboard size={20} /></span>
          <span>{project.name}</span>
        </div>
        <div className="production-top-actions">
          <a className="secondary-button production-open-editor" href={editorHref(project.id)}><FileText size={17} /> เขียนบท</a>
          <button type="button" className="icon-button theme-button" aria-label="สลับโหมดสี" onClick={toggleTheme}>
            <Moon className="show-light" size={19} /><Sun className="show-dark" size={19} />
          </button>
        </div>
      </header>
      <div className="production-layout">
        <aside className="production-nav">
          <p>พื้นที่ทำงานของโปรเจกต์</p>
          <ProductionNav projectId={project.id} view={view} />
        </aside>
        <main className="production-main">
          {view === "board" && <BeatBoard project={project} />}
          {(view === "characters" || view === "locations") &&
            <ReferenceManager type={view} project={project} initialReference={initialReference} />}
          {view === "analytics" && <ScriptAnalytics project={project} />}
        </main>
      </div>
      <nav className="bottom-nav production-bottom-nav" aria-label="เมนูวางแผนเรื่อง">
        <a href={editorHref(project.id)}><FileText size={20} /> เขียนบท</a>
        <a href={productionHref(project.id)} aria-current={view === "board" ? "page" : undefined}
          className={view === "board" ? "bottom-active" : ""}><LayoutGrid size={20} /> Beat Board</a>
        <button type="button" onClick={() => setShowMenu(true)} className={view === "board" ? "" : "bottom-active"}><Menu size={20} /> เครื่องมือ</button>
      </nav>
      {showMenu && (
        <Dialog title="เครื่องมือโปรเจกต์" drawer onClose={() => setShowMenu(false)}>
          <ProductionNav projectId={project.id} view={view} />
        </Dialog>
      )}
    </div>
  );
}

function Placeholder({ text = "กำลังเปิดโปรเจกต์…", onRetry }: { text?: string; onRetry?: () => void }) {
  return (
    <main className="production-placeholder">
      <span className="brand-mark"><Clapperboard size={22} /></span>
      <h1>{text}</h1>
      {onRetry && <button type="button" className="primary-button" onClick={onRetry}>ลองอีกครั้ง</button>}
      <a className="secondary-button" href="/"><ArrowLeft size={17} /> กลับไปยังโปรเจกต์</a>
    </main>
  );
}

function ProductionRoute({ toggleTheme }: { toggleTheme: () => void }) {
  const search = useSearchParams();
  const projectId = search.get("project");
  const requested = search.get("view");
  const view = views.find((key) => key === requested) ?? "board";
  const initialReference = search.get("reference");
  const [attempt, setAttempt] = useState(0);
  const result = useLiveQuery(async () => {
    try {
      return { project: projectId ? await getProject(projectId) : undefined, error: false };
    } catch {
      return { project: undefined, error: true };
    }
  }, [projectId, attempt]);

  if (!result) return <Placeholder />;
  if (result.error) return <Placeholder text="เปิดโปรเจกต์ไม่ได้" onRetry={() => setAttempt((current) => current + 1)} />;
  if (!result.project) return <Placeholder text="ไม่พบโปรเจกต์" />;
  return <Workspace key={JSON.stringify([result.project.id, view, initialReference])} project={result.project}
    view={view} initialReference={initialReference} toggleTheme={toggleTheme} />;
}

export function ProductionPage() {
  const toggleTheme = useTheme();
  usePwa();
  return <Suspense fallback={<Placeholder />}><ProductionRoute toggleTheme={toggleTheme} /></Suspense>;
}
