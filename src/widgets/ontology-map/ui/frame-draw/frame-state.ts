import type { DomeNodeFrame } from "../../model/dome-view";
import type { EvidenceLight } from "../../render/dome-light";
import { createStrataLodChords } from "../../model/strata-lod";
import type { PlacedRelationCaption } from "../../render/relation-captions";
import type { TopologyWorld } from "../topology-world";

// State that several pass modules reassign; an imported `let` cannot be reassigned.
export const S = {
  effectiveAlphaWorld: null as WeakRef<TopologyWorld> | null,
  lodPresenceReused: new Float32Array(0),
  lodDustDrawn: 0,
  lodChordsDrawn: 0,
  drawnNodeCount: 0,
  drawnLabelBoxes: [] as {
    nodeId: string;
    text: string;
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  }[],
  drawnRelationCaptions: [] as PlacedRelationCaption[],
  mapCometsOn: true,
  drawnSkyTimeMs: 0,
};

export const BACKGROUND_DIM_WHEN_EXPANDED = 0.8;
export const EMPTY_NEIGHBOR_SET: ReadonlySet<string> = new Set();
export const effectiveAlphaByIdReused = new Map<string, number>();
export const domeEdgeIndexReused: number[] = [];
export const litSectorIdsReused = new Set<string>();
export const domeNodeFrameReused: DomeNodeFrame[] = [];
export const domeEdgeFrameAReused: DomeNodeFrame[] = [];
export const domeEdgeFrameBReused: DomeNodeFrame[] = [];
export const lodDustByState: Record<EvidenceLight, number> = { current: 0, stale: 0, unknown: 0 };

export function lastDrawnLod(): {
  dust: number;
  dustStates: Readonly<Record<EvidenceLight, number>>;
  chords: number;
  represented: number;
  hidden: number;
} {
  return {
    dust: S.lodDustDrawn,
    dustStates: { ...lodDustByState },
    chords: S.lodChordsDrawn,
    represented: lodChords.represented,
    hidden: lodChords.hidden,
  };
}

export function lastHiddenDependencies(): number {
  return lodChords.hidden;
}

export const lodChords = createStrataLodChords();
export const lodHoverEgoReused = new Set<string>();
export const drawnScreenRadiusByIdReused = new Map<string, number>();
export const ZERO_DOME_FRAME: DomeNodeFrame = { dx: 0, dy: 0, s: 1, a: 0, u: 0 };

export function lastDrawnNodeAlphas(): ReadonlyMap<string, number> {
  return effectiveAlphaByIdReused;
}

export function lastDrawnNodeCount(): number {
  return S.drawnNodeCount;
}

export const litDrawnStateCounts: Record<EvidenceLight, number> = { current: 0, stale: 0, unknown: 0 };

export function lastLitStateCounts(): Readonly<Record<EvidenceLight, number>> {
  return { ...litDrawnStateCounts };
}

export function setMapComets(on: boolean): void {
  S.mapCometsOn = on;
}

export function lastDrawnRelationCaptions(): readonly PlacedRelationCaption[] { return S.drawnRelationCaptions; }

export function lastDrawnSkyTimeMs(): number {
  return S.drawnSkyTimeMs;
}

export function lastDrawnLabelBoxes(): readonly {
  nodeId: string;
  text: string;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}[] {
  return S.drawnLabelBoxes;
}
