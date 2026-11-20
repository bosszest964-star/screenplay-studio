import { shootingRow, shootingScenes } from "../call-sheet";
import { nameKey } from "../production";
import { projectContent, stableJson } from "../project-content";
import { sceneText, type Project, type ScreenplayBlock, type TextBlock } from "../screenplay";
import { lastLight } from "./last-light";
import { mountains } from "./mountains";
import { rain } from "./rain";
import type { SampleBlock, SampleTemplate } from "./types";

export const sampleDataVersion = 2;

function screenplayBlocks(prefix: string, entries: SampleBlock[]): ScreenplayBlock[] {
  return entries.map(([kind, text, audio], index) => {
    const id = `${prefix}-block-${index + 1}`;
    return kind === "audioVisual" ? { id, kind, visual: text, audio } : { id, kind, text };
  });
}

function buildSample(template: SampleTemplate): Project {
  const { id, name, format, cover, opening, characters, locations, scenes, call } = template;
  const cast = characters.map((profile, index) => ({ ...profile, id: `${id}-character-${index + 1}` }));
  const castIds = new Map(cast.map((profile) => [profile.name, profile.id]));
  const project: Project = {
    id, name, format, cover, createdAt: 0, updatedAt: 0,
    ...(format === "thai" ? { dialogueQuotes: true } : {}),
    characters: cast,
    locations: locations.map((profile, index) => ({ ...profile, id: `${id}-location-${index + 1}` })),
    beats: [],
    blocks: screenplayBlocks(id, opening ?? []),
  };
  const beats = scenes.map(({ setting, location, time, cast, beat, blocks }, index) => {
    const sceneId = `${id}-scene-${index + 1}`;
    const scene = { setting, location, time };
    const heading: TextBlock = { id: sceneId, kind: "sceneHeading", text: sceneText(scene), scene };
    project.blocks.push(heading, ...screenplayBlocks(sceneId, blocks));
    const sceneCast = cast.map((name) => {
      const id = castIds.get(name);
      if (!id) throw new Error(`Missing sample character ${name}`);
      return id;
    });
    return { ...beat, id: sceneId, sceneId, scene, castIds: sceneCast };
  });
  project.beats = beats;

  const sources = shootingScenes(project);
  project.callSheets = [{
    id: `${id}-call-1`,
    header: { ...call.header, title: name, queue: "Q 1", version: "1" },
    rows: call.order.map((number) => {
      const sceneId = beats[number - 1].sceneId;
      const source = sources.get(sceneId);
      if (!source) throw new Error(`Missing sample shooting scene ${sceneId}`);
      return { ...shootingRow(sceneId, source), ...scenes[number - 1].shoot };
    }),
    castCalls: call.cast.map(({ name, ...entry }) => ({ ...entry, key: nameKey(name) })),
    productionNote: call.note,
  }];
  return project;
}

export const sampleProjects = [lastLight, rain, mountains].map(buildSample);

export function sampleSignature(project: Project) {
  return stableJson(projectContent(project));
}

const currentSignatures = new Map(sampleProjects.map((project) => [project.id, sampleSignature(project)]));

export function isLegacySample(project: Project) {
  const sample = sampleProjects.find(({ id }) => id === project.id);
  return !!sample && project.name === sample.name && project.cover === sample.cover && project.format === sample.format &&
    !project.blocks.length && !project.beats?.length && !project.locations?.length && !project.characters?.length &&
    !project.callSheets?.length && !project.speedSession && project.dialogueQuotes === undefined;
}

export function pristineSample(project: Project) {
  const current = currentSignatures.get(project.id);
  return !!current && (isLegacySample(project) || sampleSignature(project) === current);
}
