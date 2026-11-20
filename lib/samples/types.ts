import type { CallHeader, CastCall, ShootingRow } from "../call-sheet";
import type { BeatColor, CharacterProfile, LocationProfile } from "../production";
import type { Project, SceneHeading, TextBlockKind } from "../screenplay";

export type SampleBlock = readonly [Exclude<TextBlockKind, "sceneHeading">, string]
  | readonly ["audioVisual", string, string];

export interface SampleScene extends SceneHeading {
  cast: string[];
  beat: { color: BeatColor; title: string; notes: string };
  blocks: SampleBlock[];
  shoot: Pick<ShootingRow, "setting" | "time" | "props" | "note"> & { support?: string };
}

export interface SampleTemplate {
  id: string;
  name: string;
  format: Project["format"];
  cover: NonNullable<Project["cover"]>;
  opening?: SampleBlock[];
  characters: Omit<CharacterProfile, "id" | "imageId">[];
  locations: Omit<LocationProfile, "id" | "imageId">[];
  scenes: SampleScene[];
  call: {
    header: Omit<CallHeader, "title" | "queue" | "version">;
    order: number[];
    cast: (Omit<CastCall, "key"> & { name: string })[];
    note: string;
  };
}
