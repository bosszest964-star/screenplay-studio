"use client";

import { Clapperboard, Clock3, Ellipsis, FileText, LayoutGrid, PencilLine, Trash2 } from "lucide-react";
import { useId } from "react";
import { productionHref } from "@/lib/production";
import { editorHref, screenplayFormats, type Project } from "@/lib/screenplay";

const dateFormatter = new Intl.DateTimeFormat("th-TH", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

export function formatDate(timestamp: number) {
  return dateFormatter.format(timestamp);
}

interface ProjectCardProps {
  project: Project;
  menuOpen: boolean;
  onDetails: () => void;
  onToggleMenu: () => void;
  onRename: () => void;
  onDelete: () => void;
}

export function ProjectCard({
  project, menuOpen, onDetails, onToggleMenu, onRename, onDelete,
}: ProjectCardProps) {
  const menuId = useId();

  return (
    <article className="project-card">
      <div
        className={`project-cover ${project.cover ? `cover-${project.cover}` : "cover-new"}`}
        aria-hidden="true"
      >
        {!project.cover && <Clapperboard size={33} strokeWidth={1.45} />}
      </div>
      <div className="project-body">
        <div className="project-top">
          <span className={`format-tag format-${project.format}`}>
            <FileText size={12} /> {screenplayFormats[project.format]}
          </span>
          <div className="project-actions" data-project-actions>
            <button
              className="icon-button project-more"
              type="button"
              aria-label={`ตัวเลือกสำหรับ ${project.name}`}
              aria-expanded={menuOpen}
              aria-controls={menuId}
              onClick={onToggleMenu}
            >
              <Ellipsis size={20} />
            </button>
            <div className="action-popover" id={menuId} hidden={!menuOpen}>
              <a href={productionHref(project.id)}><LayoutGrid size={16} />วางแผนเรื่อง</a>
              <button type="button" onClick={onDetails}><FileText size={16} />รายละเอียด</button>
              <button type="button" onClick={onRename}><PencilLine size={16} />เปลี่ยนชื่อ</button>
              <button type="button" className="danger-text" onClick={onDelete}><Trash2 size={16} />ลบโปรเจกต์</button>
            </div>
          </div>
        </div>
        <h3>
          <a className="project-name" href={editorHref(project.id)}>{project.name}</a>
        </h3>
        <p className="project-date"><Clock3 size={13} /> {formatDate(project.updatedAt)}</p>
      </div>
    </article>
  );
}
