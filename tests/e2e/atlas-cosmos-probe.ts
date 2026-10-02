import type { Page } from "@playwright/test";
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

export async function waitForCosmosStill(page: Page, frames = 24): Promise<void> {
  await page.waitForFunction(
    (need) => {
      const probe = window.__atlasCosmos;
      if (!probe) return false;
      const w = window as unknown as { __cosmosStill?: { key: string; count: number } };
      const c = probe.camera();
      const key = `${c.x.toFixed(4)},${c.y.toFixed(4)},${c.scale.toFixed(6)},${probe.interaction().kind}`;
      const still = probe.interaction().kind === "none" && w.__cosmosStill?.key === key;
      w.__cosmosStill = { key, count: still ? w.__cosmosStill!.count + 1 : 0 };
      return w.__cosmosStill.count >= need;
    },
    frames,
    { polling: "raf" },
  );
}

declare global {
  interface Window {
    __atlasCosmos?: AtlasCosmosProbe;
  }
}
