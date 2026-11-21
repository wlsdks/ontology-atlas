import { computeBowControlPoint, computeDependsBowControlPoint } from "../../render/traces";
import type { OntologyMapTokens } from "../../tokens/read-map-tokens";
import {
  accumulateBounds,
  computeSpineBounds,
  extentBounds,
  growBounds,
  isSpineNode,
} from "./framing/world-bounds";
import type { TopologyWorld, WorldEdge, WorldNode } from "./topology-world";

/** A `depends` edge bows by its own token; a `contains` edge bows toward the inner node's far angle. */
export function computeEdgeControlPoint(
  kind: WorldEdge["kind"],
  a: Pick<WorldNode, "x" | "y">,
  b: Pick<WorldNode, "x" | "y">,
  tokens: Pick<OntologyMapTokens, "edgeBowDepends" | "edgeBowContains" | "edgeBlendContains">): { x: number; y: number } {
  return kind === "depends"
    ? computeDependsBowControlPoint(a, b, tokens.edgeBowDepends)
    : computeBowControlPoint(a, b, tokens.edgeBowContains, tokens.edgeBlendContains);
}

/**
 * Writes live force-simulation positions back into the (mutable) world nodes.
 * Positions the sim didn't produce (non-finite, guarded out in
 * `force-layout.ts#positions`) leave the node's last-good coordinate intact.
 */
export function applyForcePositions(world: TopologyWorld, positions: ReadonlyMap<string, { x: number; y: number;
}>): void {
  // Iterate over the positions given, not all world nodes: a throttled tick moves a few dozen, and a
  // node absent from the map keeps its coordinates.
  for (const [id, p] of positions) {
    const node = world.nodeById.get(id);
    if (node) {
      node.x = p.x;
      node.y = p.y;
    }
  }
}

/**
 * Refreshes one edge's endpoints + bow control point from its (force-updated)
 * endpoint nodes.
 */
function recomputeEdgeGeometry(world: TopologyWorld, tokens: OntologyMapTokens, edge: WorldEdge): void {
  const a = world.nodeById.get(edge.sourceId);
  const b = world.nodeById.get(edge.targetId);
  if (!a || !b) return;
  edge.ax = a.x;
  edge.ay = a.y;
  edge.bx = b.x;
  edge.by = b.y;
  const control = computeEdgeControlPoint(edge.kind, a, b, tokens);
  edge.controlX = control.x;
  edge.controlY = control.y;
}

/**
 * The partial refresh when only the moved nodes were given. Edges: only those attached to a moved node (`edgeIndexByNode`); one with both ends moved is computed twice,
 * which is idempotent and cheaper than a dedupe Set every frame. bbox: grow only, as the pan clamp's input where "slightly generous" is safe; the exact shrink returns on the frame the drag ends.
 */
function recomputeMovedGeometry(world: TopologyWorld, tokens: OntologyMapTokens, movedIds: ReadonlySet<string>): void {
  for (const id of movedIds) {
    const indices = world.edgeIndexByNode.get(id);
    if (indices) {
      for (const index of indices) recomputeEdgeGeometry(world, tokens, world.edges[index]);
    }
    const node = world.nodeById.get(id);
    if (!node) continue;
    growBounds(world.bounds, node, tokens);
    if (isSpineNode(node)) growBounds(world.spineBounds, node, tokens);
  }
}

/**
 * Recomputes edge endpoints, bow control points and the world bounds from the current node positions, each frame while the sim is warm. `movedIds` scopes the pass to the
 * nodes that changed this frame; omit it (or pass null) for the exact full pass the homing, relayout and `relaxNewlyVisible` paths want. A missing id leaves an edge detached from
 * its node: derive the set from the positions actually written, not the set intended to move, since the drag frame writes through force apply, neighbour tug and overlap relaxation.
 */
export function recomputeWorldGeometry(
  world: TopologyWorld,
  tokens: OntologyMapTokens,
  movedIds?: ReadonlySet<string> | null): void {
  if (movedIds) {
    // Past half moved, routing through the index costs more than it saves (map
    // lookups plus duplicate computation). Above that boundary the full path is
    // cheaper, and it also gives the bbox a chance to «shrink» exactly.
    if (movedIds.size * 2 < world.nodes.length) {
      recomputeMovedGeometry(world, tokens, movedIds);
      return;
    }
  }

  for (const edge of world.edges) {
    recomputeEdgeGeometry(world, tokens, edge);
  }

  const full = accumulateBounds(world.nodes, tokens);
  if (full) {
    world.bounds.minX = full.minX;
    world.bounds.minY = full.minY;
    world.bounds.maxX = full.maxX;
    world.bounds.maxY = full.maxY;
  }
  const spine = world.dial ? extentBounds(world.dial) : computeSpineBounds(world.nodes, tokens);
  world.spineBounds.minX = spine.minX;
  world.spineBounds.minY = spine.minY;
  world.spineBounds.maxX = spine.maxX;
  world.spineBounds.maxY = spine.maxY;
}
