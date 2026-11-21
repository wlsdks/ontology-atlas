"use client";

import {
  useRef
} from "react";
import {
  type SpringOffset,
} from "../../../expressive/release-offsets";
import { type ForceSimulation } from "../../../model/layout/force-layout";
import { type HomeSpringState } from "../../../model/layout/relayout-home";
import type { NodeDragState } from "../../input/topology-pointer-types";
import { type TopologyWorld } from "../topology-world";

/** Own simulation, drag deformation, and coordinate homing state. */
export function useTopologyWorldState() {

  const worldRef = useRef<TopologyWorld | null>(null);

  // Live force simulation (`model/layout/force-layout.ts`) — seeded off the concentric
  // layout, ticked while warm (`heatRef > 0`) or while a node is pinned.
  const simRef = useRef<ForceSimulation | null>(null);

  const heatRef = useRef(0);

  const nodeDragRef = useRef<NodeDragState | null>(null);

  /** Touch pinch-zoom — the active touch pointers (pointerId → canvas coords). The hook owns this state because the handler factory is recreated every render. */
  const activeTouchesRef = useRef<Map<number, { x: number; y: number; }>>(new Map());

  /** Previous frame's distance/midpoint for a pinch in progress (null = not pinching). */
  const pinchRef = useRef<{ dist: number; midX: number; midY: number; } | null>(null);

  /** The tug/settle-restriction set for the active drag, or one just released through its settle burst. */
  const dragAffectedSetRef = useRef<{ draggedId: string; oneHop: ReadonlySet<string>; twoHop: ReadonlySet<string>; } | null>(null);

  /** The dragged node's world position at grab time, for this drag's total displacement Δ. */
  const dragStartPosRef = useRef<{ x: number; y: number; } | null>(null);

  /**
   * Each tug-affected neighbour's offset (world units) plus velocity, added to its natural position.
   * Live it lags exponentially (`stepTugAxis`); after release it is a damped spring from the node's mass
   * (`expressive/release-offsets.ts`). The dragged node's entry is its drop.
   */
  const dragTugOffsetsRef = useRef<Map<string, SpringOffset>>(new Map());

  /** The dragged node's smoothed world velocity while pinned — what its drop carries on release. */
  const dragVelRef = useRef<{ x: number; y: number; }>({ x: 0, y: 0 });

  /** The dragged node's position last frame, for the velocity above. */
  const dragPreviousPosRef = useRef<{ x: number; y: number; } | null>(null);

  /** True once this release's drop has been seeded, so it is seeded exactly once. */
  const dropSeededRef = useRef(false);

  /** When the current hover began (ms), for the press response in the draw. */
  const hoverStartRef = useRef<{ id: string | null; at: number; }>({ id: null, at: 0 });

  /**
   * The node the press just left. The draw keeps the press radius coefficient on it while emphasis
   * decays, so hover-out eases instead of stepping down.
   */
  const hoverReleasedRef = useRef<string | null>(null);

  /**
   * Coordinate snapshot from the start of a sim frame (node-array order): comparing at the end of the frame yields the nodes that really moved and narrows the derived geometry
   * update to them (`recomputeWorldGeometry(world, tokens, movedIds)`). Measured, not inferred: force application, neighbour tug and separation relaxation write coordinates in one
   * frame and inference eventually misses one, detaching edges from nodes.
   */
  const geomPreviousXRef = useRef<Float64Array | null>(null);

  const geomPreviousYRef = useRef<Float64Array | null>(null);

  /**
   * Nodes that separation relaxation displaced last frame and that sit outside the force-applied set: this frame's `applyForcePositions` reverts their coordinates to the sim values,
   * so the narrowed write-back must include them to keep that behaviour.
   */
  const sepDisplacedIdsRef = useRef<Set<string>>(new Set());

  /** Active auto-arrange homing springs, keyed by node id; empty when no relayout is in flight. */
  const homeSpringsRef = useRef<Map<string, HomeSpringState>>(new Map());

  const homingActiveRef = useRef(false);

  /**
   * Per-node homing target override while a realm is active; null falls back to global
   * `homeX`/`homeY`. Inside a realm the targets are `insideTargets`. Cleared when homing converges or
   * is cancelled.
   */
  const homeTargetOverrideRef = useRef<ReadonlyMap<string, { x: number; y: number; }> | null>(null);

  /** Previous frame's pin-dragged node id, to detect the release transition. */
  const previousPinnedNodeIdRef = useRef<string | null>(null);
  return {
    worldRef, simRef, heatRef, nodeDragRef, activeTouchesRef, pinchRef, dragAffectedSetRef, dragStartPosRef,
    dragTugOffsetsRef, dragVelRef, dragPreviousPosRef, dropSeededRef, hoverStartRef, hoverReleasedRef,
    geomPreviousXRef, geomPreviousYRef, sepDisplacedIdsRef, homeSpringsRef, homingActiveRef, homeTargetOverrideRef,
    previousPinnedNodeIdRef,
  };
}
