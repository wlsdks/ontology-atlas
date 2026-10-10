import type { DomeNodeFrame } from "../../model/dome-view";
import type { EvidenceLight } from "../../render/dome-light";
import { createStrataLodChords } from "../../model/strata-lod";
import type { PlacedRelationCaption } from "../../render/relation-captions";
import type { TopologyWorld } from "../topology-world";

// State that several pass modules reassign; an imported `let` cannot be reassigned.
export const passState = {
  // Weak, so a closed map holds no graph.
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

// 0.8 is the floor that keeps dimmed background marks at 3:1 contrast or better.
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
    dust: passState.lodDustDrawn,
    dustStates: { ...lodDustByState },
    chords: passState.lodChordsDrawn,
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
// Shared by every 2D node; never mutate it.
export const ZERO_DOME_FRAME: DomeNodeFrame = { dx: 0, dy: 0, s: 1, a: 0, u: 0 };

// Hit testing reads the alphas this frame drew, so every channel that lifts a node stays clickable.
export function lastDrawnNodeAlphas(): ReadonlyMap<string, number> {
  return effectiveAlphaByIdReused;
}

// Counted after culling; the readout must not infer it from the zoom tier.
export function lastDrawnNodeCount(): number {
  return passState.drawnNodeCount;
}

export const litDrawnStateCounts: Record<EvidenceLight, number> = { current: 0, stale: 0, unknown: 0 };

export function lastLitStateCounts(): Readonly<Record<EvidenceLight, number>> {
  return { ...litDrawnStateCounts };
}

export function setMapComets(on: boolean): void {
  passState.mapCometsOn = on;
}

export function lastDrawnRelationCaptions(): readonly PlacedRelationCaption[] { return passState.drawnRelationCaptions; }

export function lastDrawnSkyTimeMs(): number {
  return passState.drawnSkyTimeMs;
}

// Recorded when drawn, not when placed: a fading-out label still paints.
export function lastDrawnLabelBoxes(): readonly {
  nodeId: string;
  text: string;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}[] {
  return passState.drawnLabelBoxes;
}
