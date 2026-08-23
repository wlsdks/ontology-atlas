/**
 * C1 B1 — local spring tug during node drag. Pure math only (no DOM/canvas/
 * sim knowledge) so it's independently testable; the caller (`use-topology-
 * loop.ts`'s rAF loop, seeded by `topology-pointer-handlers.ts` at drag-start)
 * owns applying the result to world node positions.
 *
 * AUDIT FINDING this replaces: FA2's global relax (`model/force-layout.ts`,
 * 1 iteration/frame + `slowDown: 20`) is intentionally gentle for the settled
 * default layout, but that same gentleness means a dragged node produces NO
 * visible neighbor motion — the owner's "Dragging a node does not move its neighbours"
 * report. Instead of tuning FA2 (which would also affect the settled-layout
 * feel), this module propagates the DRAGGED node's own per-frame world-space
 * displacement directly to its 1-hop/2-hop neighbors, falling off by hop
 * distance, eased in smoothly (`stepTugAxis`) so the motion reads as springy
 * lag-then-catch-up rather than a rigid rod.
 */

export interface DragTugSets {
  /** Direct neighbors of the dragged node. */
  oneHop: ReadonlySet<string>;
  /** Neighbors-of-neighbors, excluding the dragged node itself and anything already in `oneHop`. */
  twoHop: ReadonlySet<string>;
}

/**
 * BFS out two hops from `draggedNodeId`. Pure — derived from `neighborMap`
 * only (same shape as `topology-world.ts#TopologyWorld.neighborMap`).
 */
export function computeDragTugSets(
  neighborMap: ReadonlyMap<string, ReadonlySet<string>>,
  draggedNodeId: string,
): DragTugSets {
  const oneHop = new Set<string>(neighborMap.get(draggedNodeId) ?? []);
  const twoHop = new Set<string>();
  for (const n1 of oneHop) {
    for (const n2 of neighborMap.get(n1) ?? []) {
      if (n2 === draggedNodeId || oneHop.has(n2)) continue;
      twoHop.add(n2);
    }
  }
  return { oneHop, twoHop };
}

export interface DragTugFactors {
  /** `--topology-v2-drag-tug-1hop` (0.45). */
  oneHop: number;
  /** `--topology-v2-drag-tug-2hop` (0.15). */
  twoHop: number;
}

/**
 * The displacement-propagation factor for a node `hopDistance` hops from the
 * dragged node: `0` = the dragged node itself (moves 1:1, handled by the
 * existing pin-drag path, not this module), `1` = direct neighbor, `2` =
 * neighbor-of-neighbor, anything farther = 0 (untouched — "far nodes byte-still").
 */
export function tugFactorForHop(hopDistance: 0 | 1 | 2 | number, factors: DragTugFactors): number {
  if (hopDistance === 0) return 1;
  if (hopDistance === 1) return factors.oneHop;
  if (hopDistance === 2) return factors.twoHop;
  return 0;
}

/**
 * How much of the hop factor survives at world-space `distance` from the grab
 * point, given a `radius` of influence (`--topology-v2-drag-tug-radius`).
 *
 * AUDIT FINDING this fixes: hop count alone is a poor stand-in for "nearby".
 * A hub-and-spoke vault puts every node within 2 hops of every other, so the
 * hop-only rule tugged the whole map — a node ~900 world units away still
 * moved ~58px on a 430px drag, which reads as the layout being mushy rather
 * than elastic. Smoothstep falloff with COMPACT SUPPORT: nodes at or past the
 * radius are exactly 0 (genuinely still, not just slightly moved), and the
 * approach to 0 is eased so nothing pops as a neighbor crosses the boundary.
 */
export function tugFalloffForDistance(distance: number, radius: number): number {
  if (radius <= 0) return 0;
  const t = Math.min(1, Math.max(0, distance / radius));
  // 1 - smoothstep(0,1,t) — flat near the grab point, zero slope at the edge.
  return 1 - t * t * (3 - 2 * t);
}

/**
 * One exponential-smoothing step of a single scalar axis (world x OR y) toward
 * `target` — the same `1 - exp(-dt/tau)` shape as `model/focus-state.ts#stepEmphasis`,
 * generalized to an arbitrary numeric range (not just 0..1) so it can ease a
 * world-space offset toward `totalDragDelta × factor` (springy lag) and back
 * toward `0` once the drag ends or the neighbor is no longer in the tug set
 * (smooth release, no pop).
 */
export function stepTugAxis(current: number, target: number, dt: number, tau: number): number {
  return current + (target - current) * (1 - Math.exp(-dt / tau));
}
