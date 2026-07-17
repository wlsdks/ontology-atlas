/**
 * Builds v2's per-mount "world" — deterministic layout + adjacency + bow
 * control points + brightness ranking — from the adapter's node/edge props
 * (`docs/TOPOLOGY-V2-DESIGN.md` §4 P2/P3). Recomputed only when the graph
 * itself changes (mount, `relayoutToken`, or a new `nodes`/`edges` reference)
 * — never per animation frame, matching the prototype's "layout precomputed
 * once" invariant (`model/layout.ts`'s own contract).
 */

import { computeConcentricLayout, type LayoutGraphNode, type LayoutRings } from "../model/layout";
import { computeBowControlPoint } from "../render/traces";
import type { TopologyV2Tokens } from "../tokens/read-topology-v2-tokens";
import type { TopologyV2Edge, TopologyV2Node } from "./TopologyMapV2";

export type WorldNodeKind = "project" | "domain" | "capability" | "element";

export interface WorldNode {
  id: string;
  kind: WorldNodeKind;
  label: string;
  x: number;
  y: number;
  isHub: boolean;
  fresh: boolean;
  /** Adapter contract (`TopologyV2Node`) has no staleness signal yet — always false until a follow-up adds one. */
  stale: boolean;
}

export interface WorldEdge {
  sourceId: string;
  targetId: string;
  kind: "contains" | "depends";
  ax: number;
  ay: number;
  bx: number;
  by: number;
  controlX: number;
  controlY: number;
  /** Ambient comet-tail progress 0..1, `depends` edges only — mutated per frame by the caller (`use-topology-loop.ts`). */
  t: number;
}

export interface TopologyWorld {
  nodes: readonly WorldNode[];
  nodeById: ReadonlyMap<string, WorldNode>;
  edges: WorldEdge[];
  neighborMap: ReadonlyMap<string, ReadonlySet<string>>;
  /** Top `starCount` nodes by magnitude — get the far-field diffraction-spike overlay. */
  brightStarIds: ReadonlySet<string>;
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
}

export function radiusForKind(kind: WorldNodeKind, tokens: TopologyV2Tokens): number {
  if (kind === "project") return tokens.radiusProject;
  if (kind === "domain") return tokens.radiusDomain;
  if (kind === "capability") return tokens.radiusCapability;
  return tokens.radiusElement;
}

export function buildTopologyWorld(
  nodes: readonly TopologyV2Node[],
  edges: readonly TopologyV2Edge[],
  tokens: TopologyV2Tokens,
): TopologyWorld {
  const containsParentById = new Map<string, string>();
  for (const edge of edges) {
    if (edge.kind === "contains") containsParentById.set(edge.target, edge.source);
  }

  const layoutInput: LayoutGraphNode[] = nodes.map((n) => ({
    id: n.id,
    kind: n.kind,
    parentId: containsParentById.get(n.id) ?? null,
  }));
  const rings: LayoutRings = {
    domain: tokens.layoutRingDomain,
    capability: tokens.layoutRingCapability,
    element: tokens.layoutRingElement,
  };
  const pointById = new Map(computeConcentricLayout(layoutInput, rings).map((p) => [p.id, p]));

  const worldNodes: WorldNode[] = nodes.map((n) => {
    const point = pointById.get(n.id);
    return {
      id: n.id,
      kind: n.kind,
      label: n.label,
      x: point?.x ?? 0,
      y: point?.y ?? 0,
      isHub: n.isHub,
      fresh: n.recentlyUpdated,
      stale: false,
    };
  });
  const nodeById = new Map(worldNodes.map((n) => [n.id, n]));

  const neighborMap = new Map<string, Set<string>>();
  for (const n of worldNodes) neighborMap.set(n.id, new Set());
  const addNeighbor = (a: string, b: string) => {
    neighborMap.get(a)?.add(b);
    neighborMap.get(b)?.add(a);
  };

  const worldEdges: WorldEdge[] = [];
  for (const edge of edges) {
    const a = nodeById.get(edge.source);
    const b = nodeById.get(edge.target);
    if (!a || !b) continue;
    addNeighbor(a.id, b.id);
    const maxBow = edge.kind === "depends" ? tokens.edgeBowDepends : tokens.edgeBowContains;
    const blend = edge.kind === "depends" ? tokens.edgeBlendDepends : tokens.edgeBlendContains;
    const control = computeBowControlPoint({ x: a.x, y: a.y }, { x: b.x, y: b.y }, maxBow, blend);
    worldEdges.push({
      sourceId: a.id,
      targetId: b.id,
      kind: edge.kind,
      ax: a.x,
      ay: a.y,
      bx: b.x,
      by: b.y,
      controlX: control.x,
      controlY: control.y,
      t: 0,
    });
  }

  // magnitude = size + fullDegree*18, ported from the prototype's `count +
  // degree*18` — the adapter has no separate "count" field, `size` is its
  // closest analog (follow-up: confirm with the HomePage adapter contract).
  const ranked = [...nodes].sort((x, y) => y.size + y.fullDegree * 18 - (x.size + x.fullDegree * 18));
  const brightStarIds = new Set(ranked.slice(0, Math.max(0, Math.round(tokens.starCount))).map((n) => n.id));

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const n of worldNodes) {
    const r = radiusForKind(n.kind, tokens);
    minX = Math.min(minX, n.x - r);
    maxX = Math.max(maxX, n.x + r);
    minY = Math.min(minY, n.y - r);
    maxY = Math.max(maxY, n.y + r);
  }
  if (!Number.isFinite(minX)) {
    minX = -100;
    minY = -100;
    maxX = 100;
    maxY = 100;
  }

  return {
    nodes: worldNodes,
    nodeById,
    edges: worldEdges,
    neighborMap,
    brightStarIds,
    bounds: { minX, minY, maxX, maxY },
  };
}

/**
 * Writes live force-simulation positions back into the (mutable) world nodes.
 * Positions the sim didn't produce (non-finite, guarded out in
 * `force-layout.ts#positions`) leave the node's last-good coordinate intact.
 */
export function applyForcePositions(world: TopologyWorld, positions: ReadonlyMap<string, { x: number; y: number }>): void {
  for (const node of world.nodes) {
    const p = positions.get(node.id);
    if (p) {
      node.x = p.x;
      node.y = p.y;
    }
  }
}

/**
 * Recomputes every edge's endpoints + bow control point and the world bounds
 * from the current (force-updated) node positions. Called each frame while the
 * sim is warm — the "layout precomputed once" invariant only held while
 * positions were static; a living graph refreshes derived geometry per frame.
 */
export function recomputeWorldGeometry(world: TopologyWorld, tokens: TopologyV2Tokens): void {
  for (const edge of world.edges) {
    const a = world.nodeById.get(edge.sourceId);
    const b = world.nodeById.get(edge.targetId);
    if (!a || !b) continue;
    edge.ax = a.x;
    edge.ay = a.y;
    edge.bx = b.x;
    edge.by = b.y;
    const maxBow = edge.kind === "depends" ? tokens.edgeBowDepends : tokens.edgeBowContains;
    const blend = edge.kind === "depends" ? tokens.edgeBlendDepends : tokens.edgeBlendContains;
    const control = computeBowControlPoint({ x: a.x, y: a.y }, { x: b.x, y: b.y }, maxBow, blend);
    edge.controlX = control.x;
    edge.controlY = control.y;
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const node of world.nodes) {
    const r = radiusForKind(node.kind, tokens);
    minX = Math.min(minX, node.x - r);
    maxX = Math.max(maxX, node.x + r);
    minY = Math.min(minY, node.y - r);
    maxY = Math.max(maxY, node.y + r);
  }
  if (Number.isFinite(minX)) {
    world.bounds.minX = minX;
    world.bounds.minY = minY;
    world.bounds.maxX = maxX;
    world.bounds.maxY = maxY;
  }
}
