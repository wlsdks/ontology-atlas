import type { PlacedRelationCaption } from "../../render/relation-captions";
import type { TopologyWorld } from "../world/topology-world";

// State that several pass modules reassign; an imported `let` cannot be reassigned.
export const passState = {
  // Weak, so a closed map holds no graph.
  effectiveAlphaWorld: null as WeakRef<TopologyWorld> | null,
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
export const drawnScreenRadiusByIdReused = new Map<string, number>();

// Hit testing reads the alphas this frame drew, so every channel that lifts a node stays clickable.
export function lastDrawnNodeAlphas(): ReadonlyMap<string, number> {
  return effectiveAlphaByIdReused;
}

// Counted after culling; the readout must not infer it from the zoom tier.
export function lastDrawnNodeCount(): number {
  return passState.drawnNodeCount;
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
