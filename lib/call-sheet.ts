import { nameKey, referenceIndex, speakerName, splitScript } from "./production";
import { sceneFields, type Project } from "./screenplay";

export const callHeaderGroups = [
  [
    { key: "title", label: "ชื่อเรื่อง / โปรเจกต์" },
    { key: "queue", label: "เลขคิว" },
    { key: "version", label: "Version" },
  ],
  [
    { key: "date", label: "วันที่ถ่ายทำ", type: "date" },
    { key: "crewCall", label: "Crew Call", type: "time", emphasis: true },
    { key: "shootCall", label: "Shoot Call", type: "time", emphasis: true },
    { key: "location", label: "โลเคชันหลัก" },
    { key: "sunrise", label: "Sunrise", type: "time" },
    { key: "sunset", label: "Sunset", type: "time" },
  ],
  [
    { key: "producer", label: "Producer" },
    { key: "director", label: "Director" },
    { key: "ad1", label: "AD1" },
    { key: "ad2", label: "AD2" },
    { key: "dop", label: "DOP" },
  ],
] as const;

export type CallHeader = Record<(typeof callHeaderGroups)[number][number]["key"], string>;

interface SceneSource {
  number: number;
  dayNight: "D" | "N";
  interiorExterior: "I" | "E";
  location: string;
  description: string;
  cast: string;
}

export interface ShootingRow {
  sceneId: string;
  source: SceneSource;
  setting: string;
  description?: string;
  cast?: string;
  support: string;
  time: string;
  props: string;
  note: string;
}

export type ShootingField = Exclude<keyof ShootingRow, "sceneId" | "source">;

export interface CastCall {
  key: string;
  pickup: string;
  note: string;
}

export interface CallSheet {
  id: string;
  header: CallHeader;
  rows: ShootingRow[];
  castCalls: CastCall[];
  productionNote: string;
}

export const shootingColumns = [
  { key: "order", label: "No", weight: 3.3 },
  { key: "number", label: "SC", weight: 3.8 },
  { key: "dayNight", label: "D/N", weight: 3.9 },
  { key: "interiorExterior", label: "I/E", weight: 3.9 },
  { key: "location", label: "Location", weight: 9.1 },
  { key: "setting", label: "Setting", weight: 10.6, editable: true, placeholder: "ชุด / เซ็ตฉาก" },
  { key: "description", label: "Description", weight: 16.4, editable: true, placeholder: "เหตุการณ์ในฉาก" },
  { key: "cast", label: "Cast", weight: 10.3, editable: true, placeholder: "แยกชื่อด้วยจุลภาค" },
  { key: "support", label: "Support", weight: 8.8, editable: true, placeholder: "นักแสดงสมทบ" },
  { key: "time", label: "Time", weight: 8.5, editable: true, placeholder: "10:00–10:30" },
  { key: "props", label: "Props", weight: 9.8, editable: true, placeholder: "อุปกรณ์ประกอบฉาก" },
  { key: "note", label: "Note", weight: 11.6, editable: true, placeholder: "หมายเหตุฉาก" },
] as const;

export const castColumns = [
  { label: "นักแสดง", weight: 27 },
  { label: "Cast / Support", weight: 15 },
  { label: "P/U Time", weight: 16 },
  { label: "NOTE", weight: 42 },
] as const;

export function callSheetHref(projectId: string, sheetId?: string, print = false) {
  const query = new URLSearchParams({ project: projectId });
  if (!print) query.set("view", "schedule");
  if (sheetId) query.set("sheet", sheetId);
  return `${print ? "/call-sheet-print/" : "/production/"}?${query}`;
}

export function newCallSheet(project: Project): CallSheet {
  const number = (project.callSheets ?? []).reduce((highest, sheet) => {
    const value = Number(/^Q\s*(\d+)$/i.exec(sheet.header.queue.trim())?.[1]);
    return Number.isSafeInteger(value) ? Math.max(highest, value) : highest;
  }, 0) + 1;

  return {
    id: crypto.randomUUID(),
    header: {
      title: project.name, queue: `Q ${number}`, version: "1",
      date: "", crewCall: "", shootCall: "", location: "", sunrise: "", sunset: "",
      producer: "", director: "", ad1: "", ad2: "", dop: "",
    },
    rows: [], castCalls: [], productionNote: "",
  };
}

function namesFrom(text: string) {
  return text.split(/[,，;；\n]+|\s+\/\s+/u).map((name) => name.trim()).filter(Boolean);
}

export function shootingScenes(project: Project) {
  const profiles = project.characters ?? [];
  const aliases = referenceIndex(profiles);
  const profileNames = new Map(profiles.map(({ id, name }) => [id, name]));
  const beatCast = new Map((project.beats ?? []).map((card) => [card.sceneId ?? card.id, card.castIds ?? []]));
  let dayNight: SceneSource["dayNight"] = "D";

  return new Map(splitScript(project.blocks).scenes.map(({ heading, blocks }, index) => {
    const scene = sceneFields(heading);
    if (scene.time !== "CONTINUOUS") dayNight = scene.time === "NIGHT" ? "N" : "D";
    const cast = new Map<string, string>();
    const description: string[] = [];
    for (const block of blocks.slice(1)) {
      if (block.kind === "character") {
        const cue = speakerName(block.text);
        const name = aliases.get(nameKey(cue))?.name ?? cue;
        if (name) cast.set(nameKey(name), name);
      }
      if (block.kind === "action" && block.text.trim()) description.push(block.text.trim());
      if (block.visual?.trim() && (block.kind !== "action" || block.visual.trim() !== block.text.trim())) {
        description.push(block.visual.trim());
      }
    }
    for (const id of beatCast.get(heading.id) ?? []) {
      const name = profileNames.get(id);
      if (name) cast.set(nameKey(name), name);
    }
    const source: SceneSource = {
      number: index + 1, dayNight, interiorExterior: scene.setting === "INT." ? "I" : "E",
      location: scene.location, description: description.join("\n"), cast: [...cast.values()].join("\n"),
    };
    return [heading.id, source] as const;
  }));
}

export function shootingRow(sceneId: string, source: SceneSource): ShootingRow {
  return { sceneId, source, setting: "", support: "", time: "", props: "", note: "" };
}

export function resolveCallSheet(sheet: CallSheet, scenes: ReturnType<typeof shootingScenes>, projectName: string) {
  const rows = sheet.rows.map((row, index) => {
    const current = scenes.get(row.sceneId);
    const source = current ?? row.source;
    return {
      ...row, ...source, order: index + 1, missing: !current,
      description: row.description ?? source.description,
      cast: row.cast ?? source.cast,
    };
  });

  const saved = new Map(sheet.castCalls.map((call) => [call.key, call]));
  const people = new Map<string, { name: string; cast: boolean; support: boolean }>();
  for (const row of rows) {
    for (const role of ["cast", "support"] as const) {
      for (const name of namesFrom(row[role])) {
        const key = nameKey(name);
        const person = people.get(key) ?? { name, cast: false, support: false };
        person[role] = true;
        people.set(key, person);
      }
    }
  }

  const cast = [...people].map(([key, person]) => {
    const call = saved.get(key);
    return {
      key, name: person.name,
      role: person.cast && person.support ? "Cast / Support" : person.cast ? "Cast" : "Support",
      pickup: call?.pickup ?? "", note: call?.note ?? "",
    };
  });
  return { ...sheet, header: { ...sheet.header, title: sheet.header.title.trim() || projectName }, rows, cast };
}

export type CallDocument = ReturnType<typeof resolveCallSheet>;

export function callDate(value: string) {
  if (!value) return "";
  const date = new Date(value + "T00:00:00Z");
  return Number.isNaN(date.valueOf()) ? value : new Intl.DateTimeFormat("th-TH", {
    dateStyle: "long", timeZone: "UTC",
  }).format(date);
}

export function callFilename(sheet: CallDocument) {
  return `${sheet.header.title} - ${sheet.header.queue || "Call Sheet"}`
    .replace(/[\\/:*?"<>|\x00-\x1f]/g, "_").trim().slice(0, 150);
}

export function shootingCells(row: CallDocument["rows"][number]) {
  return shootingColumns.map(({ key }) => key === "number" && row.missing
    ? `${row.number}*` : String(row[key]));
}

export function castCells(entry: CallDocument["cast"][number]) {
  return [entry.name, entry.role, entry.pickup, entry.note];
}

export function callSheetCsv(sheet: CallDocument) {
  const records = [
    ["ใบคิวถ่ายทำ / CALL SHEET"],
    ...callHeaderGroups.flatMap((group) => group.map(({ key, label }) => [label, sheet.header[key]])),
    [],
    shootingColumns.map(({ label }) => label),
    ...sheet.rows.map(shootingCells),
    ...(sheet.rows.some((row) => row.missing) ? [["* ฉากที่ถูกนำออกจากบท ใช้ข้อมูลที่บันทึกไว้"]] : []),
    [],
    ["Cast Call"],
    castColumns.map(({ label }) => label),
    ...sheet.cast.map(castCells),
    [],
    ["Production Note", sheet.productionNote],
  ];
  return "\ufeff" + records.map((record) => record.map((value) => {
    const cell = /^[\s\ufeff]*[=+@-]|^[\t\r\n]/u.test(value) ? "'" + value : value;
    return '"' + cell.replaceAll('"', '""') + '"';
  }).join(",")).join("\r\n") + "\r\n";
}
