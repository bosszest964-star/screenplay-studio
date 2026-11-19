"use client";

import { Clapperboard, Clock3, FileText, MessageCircle } from "lucide-react";
import { useMemo } from "react";
import { analyzeScript, linesPerPage } from "@/lib/script-analytics";
import type { Project } from "@/lib/screenplay";

const number = new Intl.NumberFormat("th-TH");
const percent = new Intl.NumberFormat("th-TH", { style: "percent", maximumFractionDigits: 1 });

function SceneRatio({ title, first, second, other }: {
  title: string;
  first: { label: string; count: number };
  second: { label: string; count: number };
  other?: number;
}) {
  const total = first.count + second.count + (other ?? 0);
  const width = (count: number) => total ? `${count / total * 100}%` : "0%";
  const breakdown = [
    first, second, ...(other ? [{ label: "รุ่งสาง / ต่อเนื่อง", count: other }] : []),
  ];

  return (
    <section className="analytics-panel">
      <h2>{title}</h2>
      <div className="ratio-track" aria-hidden="true">
        <span style={{ width: width(first.count) }} />
        <span style={{ width: width(second.count) }} />
        {!!other && <span style={{ width: width(other) }} />}
      </div>
      <dl className="ratio-legend">
        {breakdown.map(({ label, count }) => (
          <div key={label}>
            <dt><span />{label}</dt><dd>{number.format(count)} ฉาก <small>({percent.format(total ? count / total : 0)})</small></dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export function ScriptAnalytics({ project }: { project: Project }) {
  const stats = useMemo(() => analyzeScript(project.blocks, project.characters, project.locations),
    [project.blocks, project.characters, project.locations]);
  const maxLocationCount = stats.locations[0]?.count ?? 0;
  const totalWords = stats.dialogue.reduce((total, entry) => total + entry.words, 0);

  return (
    <>
      <div className="production-heading">
        <div><h1>สถิติบท</h1><p>ประมาณ {linesPerPage} บรรทัดจัดรูปแบบต่อหน้า · 1 หน้าเท่ากับ 1 นาที</p></div>
      </div>
      <dl className="analytics-summary">
        {[
          { icon: Clapperboard, label: "ฉาก", value: stats.scenes },
          { icon: FileText, label: "หน้าประมาณ", value: stats.pages },
          { icon: Clock3, label: "นาทีประมาณ", value: stats.minutes },
          { icon: MessageCircle, label: "คำในบทพูด", value: totalWords },
        ].map(({ icon: Icon, label, value }) => (
          <div key={label} className="analytics-stat"><Icon size={19} /><div><dt>{label}</dt><dd className="font-mono">{number.format(value)}</dd></div></div>
        ))}
      </dl>
      <div className="analytics-grid">
        <SceneRatio title="กลางวันและกลางคืน" first={{ label: "กลางวัน", count: stats.times.DAY }}
          second={{ label: "กลางคืน", count: stats.times.NIGHT }} other={stats.times.DAWN + stats.times.CONTINUOUS} />
        <SceneRatio title="ภายในและภายนอก" first={{ label: "ภายใน", count: stats.settings["INT."] }}
          second={{ label: "ภายนอก", count: stats.settings["EXT."] }} />
        <section className="analytics-panel">
          <h2>สถานที่ที่ใช้บ่อย</h2>
          {stats.locations.length ? (
            <ol className="location-ranking">
              {stats.locations.map(({ name, count }) => (
                <li key={name}>
                  <div><span>{name}</span><strong>{number.format(count)} ฉาก</strong></div>
                  <span className="location-meter" aria-hidden="true"><span style={{ width: `${count / maxLocationCount * 100}%` }} /></span>
                </li>
              ))}
            </ol>
          ) : <p className="analytics-empty">ยังไม่มีสถานที่ในหัวฉาก</p>}
        </section>
        <section className="analytics-panel">
          <h2>บทพูดตามตัวละคร</h2>
          {stats.dialogue.length ? (
            <table>
              <thead><tr><th scope="col">ตัวละคร</th><th scope="col">บรรทัด</th><th scope="col">คำ</th></tr></thead>
              <tbody>{stats.dialogue.map(({ name, lines, words }) => (
                <tr key={name}><th scope="row">{name}</th><td>{number.format(lines)}</td><td>{number.format(words)}</td></tr>
              ))}</tbody>
            </table>
          ) : <p className="analytics-empty">ยังไม่มีบทพูดในโปรเจกต์</p>}
        </section>
      </div>
    </>
  );
}
