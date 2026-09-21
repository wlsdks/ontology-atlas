"use client";

import {
  useRef
} from "react";
import {
  type SpringOffset,
} from "../expressive/release-offsets";
import { type ForceSimulation } from "../model/force-layout";
import { type HomeSpringState } from "../model/relayout-home";
import type { NodeDragState } from "./topology-pointer-handlers";
import { type TopologyWorld } from "./topology-world";

/** Own simulation, drag deformation, and coordinate homing state. */
export function useTopologyWorldState() {

  const worldRef = useRef<TopologyWorld | null>(null);

  // Live force simulation (`model/force-layout.ts`) — seeded off the concentric
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
   * Each tug-affected neighbour's current offset (world units) plus its velocity, added on
   * top of its natural position. While the drag is live the offset lags on the exponential
   * (`stepTugAxis`); after release it is a damped spring whose ζ and ω come from the node's
   * mass (`expressive/release-offsets.ts`, 2026-09-08), so a hub rings once and a leaf snaps.
   * The dragged node's own entry is its **drop**: seeded with the hand's velocity on release.
   */
  const dragTugOffsetsRef = useRef<Map<string, SpringOffset>>(new Map());

  /** The dragged node's smoothed world velocity while pinned — what its drop carries on release. */
  const dragVelRef = useRef<{ x: number; y: number; }>({ x: 0, y: 0 });

  /** The dragged node's position last frame, for the velocity above. */
  const dragPrevPosRef = useRef<{ x: number; y: number; } | null>(null);

  /** True once this release's drop has been seeded, so it is seeded exactly once. */
  const dropSeededRef = useRef(false);

  /** When the current hover began (ms), for the press response in the draw. */
  const hoverStartRef = useRef<{ id: string | null; at: number; }>({ id: null, at: 0 });

  /**
   * The node the press just left. The draw keeps the press's own radius coefficient on
   * it while its emphasis decays, so a hover-out eases instead of stepping down (design
   * council, 2026-09-08).
   */
  const hoverReleasedRef = useRef<string | null>(null);

  /**
   * Coordinate snapshot from the **start** of a sim frame (in node-array
   * order). Comparing against it at the end of the frame yields the nodes that
   * really moved, and narrows the derived geometry update to those
   * (`recomputeWorldGeometry(world, tokens, movedIds)`).
   *
   * Measured rather than inferred from "which set is about to move" because
   * three separate things write coordinates in one frame — force application,
   * neighbour tug, and separation relaxation — and their reaches differ.
   * Inference eventually misses one, and the symptom is a visible defect:
   * edges detached from their nodes.
   */
  const geomPrevXRef = useRef<Float64Array | null>(null);

  const geomPrevYRef = useRef<Float64Array | null>(null);

  /**
   * Nodes that **separation relaxation displaced** last frame and that sit
   * outside the force-applied set.
   *
   * This frame's `applyForcePositions` reverting their coordinates to the sim
   * values is the pre-existing behaviour, so the narrowed write-back has to
   * include them to preserve it. (Whether that revert is correct at all is a
   * separate question — nothing here changes the behaviour.)
   */
  const sepDisplacedIdsRef = useRef<Set<string>>(new Set());

  /** Active auto-arrange homing springs, keyed by node id; empty when no relayout is in flight. */
  const homeSpringsRef = useRef<Map<string, HomeSpringState>>(new Map());

  const homingActiveRef = useRef(false);

  /**
   * Per-node homing target override while a realm is active; null falls back to
   * the global `homeX`/`homeY`, and inside a realm the targets are
   * `insideTargets` (realm coordinate space). Cleared when homing converges or
   * is cancelled.
   *
   * Owner bug report 2026-07-23: the root sat outside its own warding ring.
   * Homing to global home left the ring at the realm origin while the nodes
   * flew off to spine coordinates.
   */
  const homeTargetOverrideRef = useRef<ReadonlyMap<string, { x: number; y: number; }> | null>(null);

  /** Previous frame's pin-dragged node id, to detect the release transition. */
  const prevPinnedNodeIdRef = useRef<string | null>(null);
  return {
    worldRef, simRef, heatRef, nodeDragRef, activeTouchesRef, pinchRef, dragAffectedSetRef, dragStartPosRef,
    dragTugOffsetsRef, dragVelRef, dragPrevPosRef, dropSeededRef, hoverStartRef, hoverReleasedRef,
    geomPrevXRef, geomPrevYRef, sepDisplacedIdsRef, homeSpringsRef, homingActiveRef, homeTargetOverrideRef,
    prevPinnedNodeIdRef,
  };
}
