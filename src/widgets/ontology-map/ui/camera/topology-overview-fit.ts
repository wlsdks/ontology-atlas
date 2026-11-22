import { dialOverviewBounds } from "../../dial/fit";
import { measureEdgeFitObstacle } from "../../interaction/free-area";
import type { OntologyMapTokens } from "../../tokens/read-map-tokens";
import { computeFoldedIds } from "../world/framing/density-fold";
import { computeRevealedBounds } from "../world/framing/world-bounds";
import { isSpineNode } from "../world/geometry/spine-node";
import { radiusForKind } from "../world/geometry/node-radius";
import { type TopologyWorld } from "../world/topology-world";

export function overviewBoundsFor(
  fit: "spine" | "full",
  world: TopologyWorld,
  tokens: OntologyMapTokens,
  expandedParents: ReadonlySet<string>,
  clustered: ReadonlySet<string> | null) {
  if (fit === "full") return world.bounds;
  return world.dial ? dialOverviewBounds(world.dial.scene) : computeRevealedBounds(world, tokens, expandedParents, clustered);
}

export function overviewFitTokens<T extends { cameraScaleMin: number; }>(
  tokens: T): T {
    return tokens;
}

/**
 * The overview's tokens as a fit with no concept's panel open measures them: the right side takes the
 * token and the rail's reach, since the panel stays on screen while it folds and unfolds.
 */
export function foldedPanelTokens<T extends { safeInsetRight: number }>(tokens: { safeInsetRight: number }, measured: T, canvas: HTMLCanvasElement | null) {
  return { ...measured, safeInsetRight: tokens.safeInsetRight, obstacleInsetRight: canvas ? measureEdgeFitObstacle(canvas, "right")?.reach ?? 0 : 0 };
}


export function overviewForPositionTargets(
  fit: "spine" | "full",
  world: TopologyWorld,
  tokens: OntologyMapTokens,
  targets: ReadonlyMap<string, { x: number; y: number; }>,
  expandedParents: ReadonlySet<string>): {
  bounds: { minX: number; minY: number; maxX: number; maxY: number; };
} {
  const included = new Set<string>();
  if (fit === "full") {
    for (const node of world.nodes) included.add(node.id);
  } else {
    const folded = computeFoldedIds(world, expandedParents);
    for (const node of world.nodes) if (isSpineNode(node) && !folded.has(node.id)) included.add(node.id);
    for (const parentId of expandedParents) {
      for (const childId of world.childrenByParent.get(parentId) ?? []) {
        if (!folded.has(childId)) included.add(childId);
      }
    }
  }

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const id of included) {
    const node = world.nodeById.get(id);
    const point = targets.get(id);
    if (!node || !point) continue;
    const radius = radiusForKind(node.kind, tokens);
    minX = Math.min(minX, point.x - radius);
    minY = Math.min(minY, point.y - radius);
    maxX = Math.max(maxX, point.x + radius);
    maxY = Math.max(maxY, point.y + radius);
  }

  return {
    bounds: Number.isFinite(minX)
      ? { minX, minY, maxX, maxY }
      : world.spineBounds,
  };
}
