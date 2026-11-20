import type { Project } from "./screenplay";

export function projectContent({ updatedAt, createdAt, editorRevision, speedSession, ...project }: Project) {
  return { ...project, speedSession: speedSession ?? null };
}

export function stableJson(value: unknown) {
  return JSON.stringify(value, (_, item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return item;
    return Object.fromEntries(Object.keys(item).sort().map((key) => [key, item[key]]));
  });
}
