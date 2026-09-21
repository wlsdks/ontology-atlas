import type { OntologyMapTokens } from "../tokens/read-map-tokens";
import {
  computeRevealedBounds,
  isSpineNode,
  radiusForKind,
  type TopologyWorld,
} from "./topology-world";

export function overviewBoundsFor(
  fit: "spine" | "full",
  world: TopologyWorld,
  tokens: OntologyMapTokens,
  expandedParents: ReadonlySet<string>,
  clustered: ReadonlySet<string> | null,
) {
  return fit === "full"
    ? world.bounds
    : computeRevealedBounds(world, tokens, expandedParents, clustered);
}

export function overviewFitTokens<T extends { cameraScaleMin: number; }>(
  tokens: T,
  galaxyActive: boolean,
): T {
  return galaxyActive ? { ...tokens, cameraScaleMin: 0 } : tokens;
}

export function overviewForPositionTargets(
  fit: "spine" | "full",
  world: TopologyWorld,
  tokens: OntologyMapTokens,
  targets: ReadonlyMap<string, { x: number; y: number; }>,
  expandedParents: ReadonlySet<string>,
): {
  bounds: { minX: number; minY: number; maxX: number; maxY: number; };
  visibleCount: number;
} {
  const included = new Set<string>();
  if (fit === "full") {
    for (const node of world.nodes) included.add(node.id);
  } else {
    for (const node of world.nodes) if (isSpineNode(node)) included.add(node.id);
    for (const parentId of expandedParents) {
      for (const childId of world.childrenByParent.get(parentId) ?? []) included.add(childId);
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
    visibleCount: Math.max(1, included.size),
  };
}
