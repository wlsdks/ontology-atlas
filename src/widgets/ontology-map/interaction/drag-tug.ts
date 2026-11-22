/**
 * Local spring tug during node drag: the dragged node's per-frame world displacement propagates
 * to its 1-hop and 2-hop neighbours, falling off by hop distance and eased by `stepTugAxis`.
 * Pure math; `use-topology-loop.ts` applies the result.
 */

export interface DragTugSets {
  oneHop: ReadonlySet<string>;
  /** Neighbors-of-neighbors, excluding the dragged node itself and anything already in `oneHop`. */
  twoHop: ReadonlySet<string>;
}

/** BFS out two hops from `draggedNodeId` over `neighborMap` (the shape of `TopologyWorld.neighborMap`). */
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
  oneHop: number;
  twoHop: number;
}

/** Displacement factor for a node `hopDistance` hops from the dragged node: 0 is the dragged node itself (1:1, the pin-drag path), 1 and 2 are neighbours, farther is 0 (far nodes stay still). */
export function tugFactorForHop(hopDistance: 0 | 1 | 2 | number, factors: DragTugFactors): number {
  if (hopDistance === 0) return 1;
  if (hopDistance === 1) return factors.oneHop;
  if (hopDistance === 2) return factors.twoHop;
  return 0;
}

/**
 * How much of the hop factor survives at world-space `distance` from the grab point within `radius` (`--map-drag-tug-radius`):
 * hop count alone tugs the whole map on a hub-and-spoke vault, so a smoothstep falloff with compact support leaves
 * nodes at or past the radius exactly still and nothing pops at the boundary.
 */
export function tugFalloffForDistance(distance: number, radius: number): number {
  if (radius <= 0) return 0;
  const t = Math.min(1, Math.max(0, distance / radius));
  return 1 - t * t * (3 - 2 * t);
}

/**
 * One exponential-smoothing step of a scalar axis toward `target`, the `1 - exp(-dt/tau)` shape of
 * `stepEmphasis` generalised to any numeric range.
 */
export function stepTugAxis(current: number, target: number, dt: number, tau: number): number {
  return current + (target - current) * (1 - Math.exp(-dt / tau));
}
