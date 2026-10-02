import type { CosmosArrivalMode, CosmosFrameStats, CosmosPaintRecord } from "../../src/widgets/ontology-map/galaxy/cosmos-types";

export interface AtlasCosmosProbe {
  camera(): { x: number; y: number; scale: number; width: number; height: number; overviewScale: number; zoomRatio: number };
  room(): { x: number; y: number; width: number; height: number };
  awake(): boolean;
  frames(): number;
  frameLog(): { t: number; ms: number; builds: number; firstDraws: number; why: number; sinceInput: number }[];
  stats(): CosmosFrameStats | null;
  layout(): {
    timings: { modelMs: number; settleMs: number; placeMs: number; totalMs: number; placedGalaxies: number };
    galaxies: { id: string; label: string; shape: string; arms: number; members: number; clusters: number; sx: number; sy: number; rho: number }[];
    filaments: number;
    concepts: number;
  } | null;
  layoutRuns(): number;
  marks(): { id: string; x: number; y: number; r: number; kind: "project" | "domain" | "capability" | "element" }[];
  armPaint(on: boolean): void;
  painted(): CosmosPaintRecord[];
  selection(): { nodeId: string | null };
  interaction(): { kind: "none" | "pan" | "zoom" | "camera" };
  arrival(): { mode: CosmosArrivalMode; active: boolean; clockMs: number; totalMs: number };
  haze(): { factor: number; tau: number; awake: boolean };
  cacheBytes(): number;
  dropBitmaps(): void;
  hit(x: number, y: number): { id: string | null; galaxy: number };
  point(id: string): { x: number; y: number } | null;
  flyTo(id: string): void;
  overview(): void;
}

declare global {
  interface Window {
    __atlasCosmos?: AtlasCosmosProbe;
  }
}
