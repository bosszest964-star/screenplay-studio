"use client";

import { useLiveQuery } from "dexie-react-hooks";
import {
  ArrowDownToLine, Check, ChevronRight, Clapperboard, Database, Film, FolderOpen,
  LayoutGrid, List, Menu, Moon, Plus, Search, Settings, Sun, WifiOff,
} from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  createProject, deleteProject, initializeWorkspace, listProjects, projectNameLimit, renameProject,
} from "@/lib/projects";
import { screenplayFormats, type Project } from "@/lib/screenplay";
import { Dialog } from "./dialog";
import { formatDate, ProjectCard } from "./project-card";
import { usePwa } from "./use-pwa";
import { useTheme } from "./use-theme";

type Modal =
  | { kind: "create" }
  | { kind: "settings" }
  | { kind: "install" }
  | { kind: "details"; project: Project }
  | { kind: "rename"; project: Project }
  | { kind: "delete"; project: Project };

function Brand() {
  return (
    <div className="brand">
      <span className="brand-mark"><Clapperboard size={22} strokeWidth={1.8} /></span>
      <span className="brand-name">Sceneform<span>.</span></span>
    </div>
  );
}

export function Dashboard() {
  const toggleTheme = useTheme();
  const { installed, online, requestInstall } = usePwa();
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [initialized, setInitialized] = useState<number>();
  const [initializationError, setInitializationError] = useState<number>();
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [menu, setMenu] = useState<string | null>(null);
  const [modal, setModal] = useState<Modal | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let current = true;
    void initializeWorkspace().then(
      () => { if (current) setInitialized(loadAttempt); },
      () => { if (current) setInitializationError(loadAttempt); },
    );
    return () => { current = false; };
  }, [loadAttempt]);

  const index = useLiveQuery(async () => {
    if (initialized !== loadAttempt) return undefined;
    try {
      return { projects: await listProjects() };
    } catch {
      return { projects: null };
    }
  }, [initialized, loadAttempt]);

  useEffect(() => {
    if (!menu) return;
    const closeOutside = (event: PointerEvent) => {
      if (!(event.target instanceof Element) || !event.target.closest("[data-project-actions]")) {
        setMenu(null);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenu(null);
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [menu]);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(""), 3400);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  const storageError = initializationError === loadAttempt || index?.projects === null;
  const projects = index?.projects;
  const normalizedQuery = query.trim().toLocaleLowerCase("th");
  const visibleProjects = projects?.filter((project) =>
    project.name.toLocaleLowerCase("th").includes(normalizedQuery),
  );

  function show(next: Modal) {
    setMenu(null);
    setError("");
    setName(next.kind === "rename" ? next.project.name : "");
    setModal(next);
  }

  function showProjects() {
    setModal(null);
    setQuery("");
    window.scrollTo({ top: 0, behavior: "instant" });
  }

  async function install() {
    if (!(await requestInstall())) show({ kind: "install" });
  }

  async function saveProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!modal || busy) return;
    if (modal.kind !== "create" && modal.kind !== "rename" && modal.kind !== "delete") return;
    if (modal.kind !== "delete" && !name.trim()) {
      setError("กรุณาระบุชื่อโปรเจกต์");
      return;
    }

    setBusy(true);
    setError("");
    try {
      if (modal.kind === "create") {
        await createProject(name);
        setQuery("");
        setToast("สร้างโปรเจกต์แล้ว");
      } else if (modal.kind === "rename") {
        await renameProject(modal.project.id, name);
        setToast("เปลี่ยนชื่อโปรเจกต์แล้ว");
      } else {
        await deleteProject(modal.project.id);
        setToast("ลบโปรเจกต์แล้ว");
      }
      setModal(null);
    } catch {
      setError("บันทึกการเปลี่ยนแปลงไม่สำเร็จ กรุณาลองอีกครั้ง");
    } finally {
      setBusy(false);
    }
  }

  const newProjectButton = (className: string) => (
    <button
      type="button"
      className={className}
      onClick={() => show({ kind: "create" })}
      disabled={!projects}
    >
      <Plus size={19} /> สร้างโปรเจกต์
    </button>
  );

  const installButton = (
    <button type="button" className="secondary-button install-button" onClick={() => void install()} disabled={installed}>
      {installed ? <Check size={16} /> : <ArrowDownToLine size={16} />}
      {installed ? "ติดตั้งแล้ว" : "ติดตั้งแอป"}
    </button>
  );

  return (
    <div className="app-shell">
      <a className="skip-link" href="#project-heading">ข้ามไปยังโปรเจกต์</a>
      <aside className="sidebar" aria-label="เมนูหลัก">
        <Brand />
        <div className="sidebar-content">
          <p className="sidebar-label">พื้นที่ทำงาน</p>
          <nav className="side-nav">
            <button type="button" className="nav-item active" aria-current="page" onClick={showProjects}>
              <LayoutGrid size={19} /> โปรเจกต์ <ChevronRight className="nav-chevron" size={15} />
            </button>
            <button type="button" className="nav-item" onClick={() => show({ kind: "settings" })}>
              <Settings size={19} /> การตั้งค่า
            </button>
          </nav>
        </div>
        <div className="sidebar-footer">
          <span className="storage-dot" />
          <span>{online ? "พื้นที่ทำงานบนอุปกรณ์" : "กำลังใช้งานออฟไลน์"}</span>
        </div>
      </aside>

      <div className="app-content">
        <header className="topbar">
          <div className="mobile-brand"><Brand /></div>
          <div className="breadcrumbs">
            <span>พื้นที่ทำงาน</span><ChevronRight size={14} /><strong>โปรเจกต์</strong>
          </div>
          <div className="topbar-actions">
            <label className="search-box">
              <Search size={17} />
              <input
                ref={searchRef}
                type="search"
                aria-label="ค้นหาโปรเจกต์"
                placeholder="ค้นหาโปรเจกต์..."
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            <button type="button" className="icon-button theme-button" aria-label="สลับโหมดสี" onClick={toggleTheme}>
              <Moon className="show-light" size={20} /><Sun className="show-dark" size={20} />
            </button>
          </div>
        </header>

        <div className="dashboard-layout">
          <main className="dashboard-main">
            <section className="hero" aria-labelledby="hero-heading">
              <div className="hero-content">
                <div className="hero-icon"><Film size={19} strokeWidth={1.7} /></div>
                <h1 id="hero-heading">สตูดิโอเขียนบท</h1>
                <p>พื้นที่จัดการบทภาพยนตร์ของคุณ<br className="hero-line-break" /> พร้อมทำงานได้ทุกที่ แม้ออฟไลน์</p>
                {newProjectButton("primary-button hero-button")}
              </div>
            </section>

            <section className="projects-section" aria-labelledby="project-heading">
              <div className="section-heading">
                <div>
                  <h2 id="project-heading" tabIndex={-1}>{normalizedQuery ? "ผลการค้นหา" : "โปรเจกต์ของฉัน"}</h2>
                  <p>{visibleProjects ? `${visibleProjects.length} โปรเจกต์` : "รายการโปรเจกต์บทภาพยนตร์"}</p>
                </div>
                <div className="view-switch" role="group" aria-label="มุมมองรายการโปรเจกต์">
                  <button type="button" aria-pressed={view === "grid"} aria-label="มุมมองการ์ด" onClick={() => setView("grid")}>
                    <LayoutGrid size={17} />
                  </button>
                  <button type="button" aria-pressed={view === "list"} aria-label="มุมมองรายการ" onClick={() => setView("list")}>
                    <List size={19} />
                  </button>
                </div>
              </div>
              {storageError ? (
                <div className="empty-state" role="alert">
                  <Database size={28} />
                  <h3>เปิดพื้นที่จัดเก็บไม่ได้</h3>
                  <p>กรุณาตรวจสอบว่าเบราว์เซอร์อนุญาตให้เก็บข้อมูลบนอุปกรณ์</p>
                  <button type="button" className="secondary-button" onClick={() => setLoadAttempt((attempt) => attempt + 1)}>ลองอีกครั้ง</button>
                </div>
              ) : !visibleProjects ? (
                <div className="loading-grid" aria-busy="true" aria-label="กำลังโหลดโปรเจกต์">
                  {[1, 2, 3].map((placeholder) => <span key={placeholder} />)}
                </div>
              ) : visibleProjects.length === 0 ? (
                <div className="empty-state">
                  {normalizedQuery ? <Search size={29} /> : <FolderOpen size={29} />}
                  <h3>{normalizedQuery ? "ไม่พบโปรเจกต์" : "เริ่มโปรเจกต์แรกของคุณ"}</h3>
                  <p>{normalizedQuery ? "ลองค้นหาด้วยชื่อโปรเจกต์อื่น" : "เพิ่มโปรเจกต์บทภาพยนตร์ใหม่ในพื้นที่ทำงาน"}</p>
                  {normalizedQuery ? (
                    <button type="button" className="secondary-button" onClick={() => { setQuery(""); searchRef.current?.focus(); }}>ล้างการค้นหา</button>
                  ) : newProjectButton("primary-button")}
                </div>
              ) : (
                <div className={`project-grid view-${view}`}>
                  {visibleProjects.map((project) => (
                    <ProjectCard
                      key={project.id}
                      project={project}
                      menuOpen={menu === project.id}
                      onDetails={() => show({ kind: "details", project })}
                      onToggleMenu={() => setMenu(menu === project.id ? null : project.id)}
                      onRename={() => show({ kind: "rename", project })}
                      onDelete={() => show({ kind: "delete", project })}
                    />
                  ))}
                </div>
              )}
            </section>
          </main>

          <aside className="workspace-rail" aria-label="ภาพรวมพื้นที่ทำงาน">
            <div className="rail-card">
              <h2>ภาพรวมพื้นที่ทำงาน</h2>
              <div className="stat">
                <span className="stat-icon"><FolderOpen size={20} strokeWidth={1.7} /></span>
                <div><strong className="font-mono">{projects?.length ?? "–"}</strong><p>โปรเจกต์ทั้งหมด</p></div>
              </div>
              <div className="rail-divider" />
              <div className="storage-info">
                {online ? <Database size={17} /> : <WifiOff size={17} />}
                <div><strong>{online ? "บันทึกบนอุปกรณ์" : "กำลังใช้งานออฟไลน์"}</strong><p>ข้อมูลเก็บในเบราว์เซอร์นี้</p></div>
              </div>
            </div>
            <div className="rail-card install-card">
              <div className="install-icon"><ArrowDownToLine size={20} strokeWidth={1.8} /></div>
              <h2>Sceneform บนหน้าจอโฮม</h2>
              <p>เปิดจากหน้าจอโฮมแบบเต็มจอได้แม้ออฟไลน์</p>
              {installButton}
            </div>
          </aside>
        </div>
      </div>

      <nav className="bottom-nav" aria-label="เมนูด้านล่าง">
        <button type="button" className="bottom-active" aria-current="page" onClick={showProjects}>
          <LayoutGrid size={20} /><span>โปรเจกต์</span>
        </button>
        <button type="button" onClick={() => show({ kind: "create" })} disabled={!projects}>
          <span className="bottom-plus"><Plus size={21} /></span><span>สร้างใหม่</span>
        </button>
        <button type="button" onClick={() => show({ kind: "settings" })}>
          <Menu size={21} /><span>เมนู</span>
        </button>
      </nav>

      <div className="toast-region" role="status" aria-live="polite">
        {toast && <div className="toast"><span><Check size={16} /></span>{toast}</div>}
      </div>

      {modal?.kind === "settings" && (
        <Dialog key="settings" title="การตั้งค่า" drawer onClose={() => setModal(null)}>
          <div className="settings-row">
            <div><strong>ธีมหน้าจอ</strong><p>สลับระหว่างโหมดสว่างและโหมดมืด</p></div>
            <button type="button" className="icon-button theme-button" aria-label="สลับโหมดสี" onClick={toggleTheme}>
              <Moon className="show-light" size={20} /><Sun className="show-dark" size={20} />
            </button>
          </div>
          <div className="settings-row">
            <div><strong>แอปบนหน้าจอโฮม</strong><p>เปิด Sceneform แบบเต็มหน้าจอ</p></div>
            {installButton}
          </div>
        </Dialog>
      )}
      {modal?.kind === "install" && (
        <Dialog key="install" title="ติดตั้ง Sceneform" onClose={() => setModal(null)}>
          <p className="dialog-text">เปิดเมนูแชร์ใน Safari แล้วเลือก “เพิ่มไปยังหน้าจอโฮม” หรือเปิดเมนูของเบราว์เซอร์แล้วเลือก “ติดตั้งแอป” หากมีตัวเลือกนี้</p>
          <div className="dialog-actions"><button className="primary-button" type="button" onClick={() => setModal(null)}>เข้าใจแล้ว</button></div>
        </Dialog>
      )}
      {modal?.kind === "details" && (
        <Dialog key="details" title={modal.project.name} onClose={() => setModal(null)}>
          <dl className="project-details">
            <div><dt>รูปแบบบท</dt><dd>{screenplayFormats[modal.project.format]}</dd></div>
            <div><dt>วันที่สร้าง</dt><dd>{formatDate(modal.project.createdAt)}</dd></div>
            <div><dt>แก้ไขล่าสุด</dt><dd>{formatDate(modal.project.updatedAt)}</dd></div>
          </dl>
          <div className="dialog-actions">
            <button className="secondary-button danger-text" type="button" onClick={() => show({ kind: "delete", project: modal.project })}>ลบโปรเจกต์</button>
            <button className="primary-button" type="button" onClick={() => show({ kind: "rename", project: modal.project })}>เปลี่ยนชื่อ</button>
          </div>
        </Dialog>
      )}
      {modal && (modal.kind === "create" || modal.kind === "rename" || modal.kind === "delete") && (
        <Dialog
          key={modal.kind}
          title={modal.kind === "create" ? "สร้างโปรเจกต์ใหม่" : modal.kind === "rename" ? "เปลี่ยนชื่อโปรเจกต์" : "ลบโปรเจกต์"}
          onClose={() => setModal(null)}
          busy={busy}
        >
          <form onSubmit={saveProject} aria-busy={busy}>
            {modal.kind === "delete" ? (
              <p className="dialog-text">ลบ <strong>{modal.project.name}</strong> ออกจากพื้นที่ทำงานหรือไม่? การลบนี้ย้อนกลับไม่ได้</p>
            ) : (
              <label className="name-field">
                ชื่อโปรเจกต์
                <input
                  data-initial-focus
                  required
                  maxLength={projectNameLimit}
                  placeholder="เช่น The Last Light"
                  value={name}
                  disabled={busy}
                  onChange={(event) => setName(event.target.value)}
                />
              </label>
            )}
            {error && <p className="form-error" role="alert">{error}</p>}
            <div className="dialog-actions">
              <button className="secondary-button" type="button" disabled={busy} onClick={() => setModal(null)}>ยกเลิก</button>
              <button className={modal.kind === "delete" ? "danger-button" : "primary-button"} type="submit" disabled={busy}>
                {modal.kind === "create" ? "สร้างโปรเจกต์" : modal.kind === "rename" ? "บันทึกชื่อ" : "ลบโปรเจกต์"}
              </button>
            </div>
          </form>
        </Dialog>
      )}
    </div>
  );
}
