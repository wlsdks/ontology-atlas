import type { DialWorld } from "../../../dial/dial-shapes";
import type { OntologyMapTokens } from "../../../tokens/read-map-tokens";
import { radiusForKind } from "../node-radius";
import { isSpineNode } from "../spine-node";
import type { Bounds, TopologyWorld, WorldNode } from "../topology-world";
import { computeFoldedIds } from "./density-fold";
import type { DialBearing } from "./dial-world-framing";

export function extentBounds(dial: DialWorld): Bounds {
  return { ...dial.scene.extent };
}

const FALLBACK_BOUNDS: Bounds = { minX: -100, minY: -100, maxX: 100, maxY: 100 };

/**
 * Radius-padded bbox of the nodes matching `include` (all nodes when omitted).
 * Returns `null` when nothing matched so callers can pick their own fallback.
 */
export function accumulateBounds(
  nodes: readonly WorldNode[],
  tokens: OntologyMapTokens,
  include?: (node: WorldNode) => boolean): Bounds | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const node of nodes) {
    if (include && !include(node)) continue;
    const r = radiusForKind(node.kind, tokens);
    minX = Math.min(minX, node.x - r);
    maxX = Math.max(maxX, node.x + r);
    minY = Math.min(minY, node.y - r);
    maxY = Math.max(maxY, node.y + r);
  }
  if (!Number.isFinite(minX)) return null;
  return { minX, minY, maxX, maxY };
}

/** Radius-padded bbox of all nodes, with a finite fallback for an empty graph. */
export function computeFullBounds(nodes: readonly WorldNode[], tokens: OntologyMapTokens): Bounds {
  return accumulateBounds(nodes, tokens) ?? { ...FALLBACK_BOUNDS };
}

/**
 * Overview-fit bbox: just the spine (project + domain + hub). Falls back to the
 * full-graph bounds when no spine node exists (degenerate vault), then to a
 * finite default for an empty graph. Pure — the overview camera + its altitude/
 * zoom-ratio anchor both fit to THIS, not the full 295-node bounds.
 */
export function computeSpineBounds(nodes: readonly WorldNode[], tokens: OntologyMapTokens): Bounds {
  return accumulateBounds(nodes, tokens, isSpineNode) ?? computeFullBounds(nodes, tokens);
}

/**
 * `spineBounds` without the nodes the density gate folds: the hub is always shown by the tier gate
 * but can sit behind a crowded parent's chip, skewing the fit. Falls back to the whole spine.
 */
export function computeDrawnSpineBounds(
  world: Pick<TopologyWorld, "spineBounds" | "childrenByParent" | "nodeById"> & DialBearing,
  tokens: OntologyMapTokens,
  expandedParents: ReadonlySet<string>,
  folded: ReadonlySet<string> = computeFoldedIds(world, expandedParents)): Bounds {
  if (world.dial) return extentBounds(world.dial);
  let bounds: Bounds | null = null;
  for (const node of world.nodeById.values()) {
    if (!isSpineNode(node) || folded.has(node.id)) continue;
    if (bounds === null) {
      const r = radiusForKind(node.kind, tokens);
      bounds = { minX: node.x - r, minY: node.y - r, maxX: node.x + r, maxY: node.y + r };
    } else {
      growBounds(bounds, node, tokens);
    }
  }
  return bounds ?? { ...world.spineBounds };
}

/**
 * The drawn spine plus the children a person has expanded, so every return to the overview keeps
 * them in frame. Folded and clustered children are not drawn and do not widen it.
 */
export function computeRevealedBounds(
  world: Pick<TopologyWorld, "spineBounds" | "childrenByParent" | "nodeById"> & DialBearing,
  tokens: OntologyMapTokens,
  expandedParents: ReadonlySet<string>,
  clustered: ReadonlySet<string> | null): Bounds {
  if (world.dial) return extentBounds(world.dial);
  const folded = computeFoldedIds(world, expandedParents);
  const bounds = computeDrawnSpineBounds(world, tokens, expandedParents, folded);
  for (const parentId of expandedParents) {
    for (const childId of world.childrenByParent.get(parentId) ?? []) {
      if (folded.has(childId) || clustered?.has(childId)) continue;
      const child = world.nodeById.get(childId);
      if (child) growBounds(bounds, child, tokens);
    }
  }
  return bounds;
}

/**
 * The frame a path's target is picked in: the overview bounds grown by the source and the neighbours
 * its focus draws, since selecting the source dives to its ego graph. Its folded children stay out.
 */
export function computePathPickBounds(
  world: Pick<TopologyWorld, "nodeById" | "neighborMap" | "childrenByParent"> & DialBearing,
  tokens: OntologyMapTokens,
  sourceId: string,
  overview: Bounds,
  expandedParents: ReadonlySet<string>): Bounds {
  const bounds = { ...overview };
  const source = world.nodeById.get(sourceId);
  if (!source) return bounds;
  growBounds(bounds, source, tokens);
  const folded = computeFoldedIds(world, expandedParents);
  for (const id of world.neighborMap.get(sourceId) ?? []) {
    const node = world.nodeById.get(id);
    if (!node) continue;
    if (node.parentId === sourceId && folded.has(id)) continue;
    growBounds(bounds, node, tokens);
  }
  return bounds;
}

/**
 * Radius-padded bbox of a focused node + its 1-hop neighbours (the ego cluster), `null` when `focusedSlug` does not resolve. Shared by the focus camera fit
 * (`computeFocusCameraTarget`, which adds its fit margin) and the focus-aware pan clamp (`topology-physics-step.ts`), so the ego cluster is defined in one place.
 */
export function computeEgoBounds(
  world: Pick<TopologyWorld, "nodeById" | "neighborMap">,
  tokens: OntologyMapTokens,
  focusedSlug: string,
  /**
   * Restricts the ego bbox to the realm's members: neighbours outside the warding circle sit at fling
   * coordinates and would shrink the camera far out. Omitted means global.
   */
  restrictIds?: ReadonlySet<string> | null): Bounds | null {
  const focusNode = world.nodeById.get(focusedSlug);
  if (!focusNode) return null;
  const egoIds = new Set<string>([focusedSlug]);
  for (const id of world.neighborMap.get(focusedSlug) ?? []) {
    if (restrictIds && !restrictIds.has(id)) continue;
    egoIds.add(id);
  }
  return computeIdsBounds(world, tokens, egoIds);
}

export function computeIdsBounds(world: Pick<TopologyWorld, "nodeById">, tokens: OntologyMapTokens, ids: Iterable<string>): Bounds | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const id of ids) {
    const n = world.nodeById.get(id);
    if (!n) continue;
    const r = radiusForKind(n.kind, tokens);
    minX = Math.min(minX, n.x - r);
    maxX = Math.max(maxX, n.x + r);
    minY = Math.min(minY, n.y - r);
    maxY = Math.max(maxY, n.y + r);
  }
  if (!Number.isFinite(minX)) return null;
  return { minX, minY, maxX, maxY };
}

/**
 * Radius-padded bbox of an expanded cluster disc (parent plus its direct children's fan); expanding
 * a chip dives the camera here. Like `computeEgoBounds` but over children. Null if none.
 */
export function computeClusterDiscBounds(
  world: Pick<TopologyWorld, "nodeById" | "childrenByParent">,
  tokens: OntologyMapTokens,
  parentId: string,
  /**
   * High-fanout batch reveal: given, only nodes in this set enter the bbox (the parent plus this
   * batch's children). null or omitted means the parent plus every direct child.
   */
  restrictIds?: ReadonlySet<string> | null): Bounds | null {
  const parent = world.nodeById.get(parentId);
  if (!parent) return null;
  const ids = new Set<string>([parentId]);
  for (const id of world.childrenByParent.get(parentId) ?? []) {
    if (!restrictIds || restrictIds.has(id)) ids.add(id);
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const id of ids) {
    const n = world.nodeById.get(id);
    if (!n) continue;
    const r = radiusForKind(n.kind, tokens) * n.magnitudeScale;
    minX = Math.min(minX, n.x - r);
    maxX = Math.max(maxX, n.x + r);
    minY = Math.min(minY, n.y - r);
    maxY = Math.max(maxY, n.y + r);
  }
  if (!Number.isFinite(minX)) return null;
  return { minX, minY, maxX, maxY };
}

/** Merge one node's radius-padded box into an existing bbox (grow only — never shrink). */
export function growBounds(bounds: Bounds, node: WorldNode, tokens: OntologyMapTokens): void {
  const r = radiusForKind(node.kind, tokens);
  if (node.x - r < bounds.minX) bounds.minX = node.x - r;
  if (node.x + r > bounds.maxX) bounds.maxX = node.x + r;
  if (node.y - r < bounds.minY) bounds.minY = node.y - r;
  if (node.y + r > bounds.maxY) bounds.maxY = node.y + r;
}
