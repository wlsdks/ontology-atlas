/**
 * Builds v2's per-mount "world" — deterministic layout + adjacency + bow
 * control points + brightness ranking — from the adapter's node/edge props
 * (`docs/TOPOLOGY-V2-DESIGN.md` §4 P2/P3). Recomputed only when the graph
 * itself changes (mount, `relayoutToken`, or a new `nodes`/`edges` reference)
 * — never per animation frame, matching the prototype's "layout precomputed
 * once" invariant (`model/layout.ts`'s own contract).
 */

import { computeConcentricLayout, type LayoutGraphNode, type LayoutRings } from "../model/layout";
import { computeBowControlPoint, computeDependsBowControlPoint } from "../render/traces";
import type { TopologyV2Tokens } from "../tokens/read-topology-v2-tokens";
import type { TopologyV2Edge, TopologyV2Node } from "./TopologyMapV2";

export type WorldNodeKind = "project" | "domain" | "capability" | "element";

export interface WorldNode {
  id: string;
  kind: WorldNodeKind;
  label: string;
  x: number;
  y: number;
  /**
   * C1 B3 — the deterministic layout coordinate from THIS build pass, cached
   * once and never mutated by drag/force-sim writes to `x`/`y`. Auto-arrange
   * springs every node back to its own `homeX`/`homeY` (`use-topology-loop.ts`'s
   * `relayoutToken` effect) — the "canonical layout" contract.
   */
  homeX: number;
  homeY: number;
  isHub: boolean;
  fresh: boolean;
  /** Adapter contract (`TopologyV2Node`) has no staleness signal yet — always false until a follow-up adds one. */
  stale: boolean;
  /** Transitive descendant count — engraved as a numeral on project/domain chips in circuit range (0 = skip). */
  count: number;
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
  /**
   * P3a — containment 깊이 (엔드포인트 kind 로 유도): 0 = project 가 낀 뼈대,
   * 1 = domain 이 낀 중간 구조, 2 = capability/element 잔가지. 렌더는 이
   * 값으로 잉크 강도(굵기×명도) 사다리를 탄다 — 계층은 순서(ordinal)라
   * hue 가 아니라 명도/크기 채널이 옳다 (`edge-hierarchy-ink.md`).
   * `depends` 엣지는 타입 채널(파선) 소속이라 이 값을 쓰지 않는다.
   */
  level: 0 | 1 | 2;
  /** P3b — 원 관계 타입 (contains/depends 2치로 뭉개기 전의 의미). */
  relationType: string;
  /** P3b — 이 관계를 선언한 vault 문서 slug (엣지 팝오버의 출처 표시). */
  declaredBySlug: string | null;
}

/** P3a — 두 엔드포인트 kind 에서 containment 잉크 레벨을 유도한다. */
export function containmentLevelFor(aKind: WorldNodeKind, bKind: WorldNodeKind): 0 | 1 | 2 {
  if (aKind === "project" || bKind === "project") return 0;
  if (aKind === "domain" || bKind === "domain") return 1;
  return 2;
}

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface TopologyWorld {
  nodes: readonly WorldNode[];
  nodeById: ReadonlyMap<string, WorldNode>;
  edges: WorldEdge[];
  neighborMap: ReadonlyMap<string, ReadonlySet<string>>;
  /** Top `starCount` nodes by magnitude — get the far-field diffraction-spike overlay. */
  brightStarIds: ReadonlySet<string>;
  /** Bbox of ALL nodes — used for pan clamping and focus-mode context. */
  bounds: Bounds;
  /**
   * Bbox of just the level-0 SPINE (project + domain + hub) — what the overview
   * camera fits to. The overview only DRAWS the spine (tier gating in
   * `model/tier-visibility.ts`), so fitting the full `bounds` — which the
   * de-pileup deliberately spreads wide across all 295 nodes — zooms the ~8
   * visible spine nodes down to a dot (the fit regression). Recomputed with
   * `bounds` whenever geometry changes.
   */
  spineBounds: Bounds;
}

export function radiusForKind(kind: WorldNodeKind, tokens: TopologyV2Tokens): number {
  if (kind === "project") return tokens.radiusProject;
  if (kind === "domain") return tokens.radiusDomain;
  if (kind === "capability") return tokens.radiusCapability;
  return tokens.radiusElement;
}

const FALLBACK_BOUNDS: Bounds = { minX: -100, minY: -100, maxX: 100, maxY: 100 };

/**
 * A "spine" node is one shown at the overview entry (tier alpha = 1 at zoom
 * ratio 1): the project root, every domain, and any hub node. MUST mirror
 * `nodeTierAlpha`'s always-visible branch in `model/tier-visibility.ts` — if
 * that gate changes, this must too, or the fit and the visible set drift apart.
 */
export function isSpineNode(node: Pick<WorldNode, "kind" | "isHub">): boolean {
  return node.isHub || node.kind === "project" || node.kind === "domain";
}

/**
 * Radius-padded bbox of the nodes matching `include` (all nodes when omitted).
 * Returns `null` when nothing matched so callers can pick their own fallback.
 */
function accumulateBounds(
  nodes: readonly WorldNode[],
  tokens: TopologyV2Tokens,
  include?: (node: WorldNode) => boolean,
): Bounds | null {
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
export function computeFullBounds(nodes: readonly WorldNode[], tokens: TopologyV2Tokens): Bounds {
  return accumulateBounds(nodes, tokens) ?? { ...FALLBACK_BOUNDS };
}

/**
 * Overview-fit bbox: just the spine (project + domain + hub). Falls back to the
 * full-graph bounds when no spine node exists (degenerate vault), then to a
 * finite default for an empty graph. Pure — the overview camera + its altitude/
 * zoom-ratio anchor both fit to THIS, not the full 295-node bounds.
 */
export function computeSpineBounds(nodes: readonly WorldNode[], tokens: TopologyV2Tokens): Bounds {
  return accumulateBounds(nodes, tokens, isSpineNode) ?? computeFullBounds(nodes, tokens);
}

/**
 * Radius-padded bbox of a focused node + its 1-hop neighbors (the ego cluster).
 * Returns `null` when `focusedSlug` doesn't resolve. Shared by the focus camera
 * fit (`topology-camera-math.ts#computeFocusCameraTarget`, which adds its own
 * fit margin) and the focus-aware pan clamp (`topology-physics-step.ts`, which
 * adds `--topology-v2-camera-focus-pan-margin`) so the "ego cluster" is defined
 * in exactly one place. Pure — derived from `nodeById` + `neighborMap`.
 */
export function computeEgoBounds(
  world: Pick<TopologyWorld, "nodeById" | "neighborMap">,
  tokens: TopologyV2Tokens,
  focusedSlug: string,
): Bounds | null {
  const focusNode = world.nodeById.get(focusedSlug);
  if (!focusNode) return null;
  const egoIds = new Set<string>([focusedSlug]);
  for (const id of world.neighborMap.get(focusedSlug) ?? []) egoIds.add(id);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const id of egoIds) {
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
  // Feed the real §2.3 node radii into the deterministic de-pileup so its
  // collision min-distance matches what actually gets drawn.
  const pointById = new Map(
    computeConcentricLayout(layoutInput, rings, {
      radii: {
        project: tokens.radiusProject,
        domain: tokens.radiusDomain,
        capability: tokens.radiusCapability,
        element: tokens.radiusElement,
      },
    }).map((p) => [p.id, p]),
  );

  const worldNodes: WorldNode[] = nodes.map((n) => {
    const point = pointById.get(n.id);
    const x = point?.x ?? 0;
    const y = point?.y ?? 0;
    return {
      id: n.id,
      kind: n.kind,
      label: n.label,
      x,
      y,
      homeX: x,
      homeY: y,
      isHub: n.isHub,
      fresh: n.recentlyUpdated,
      stale: false,
      count: n.descendantCount,
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
    const control =
      edge.kind === "depends"
        ? computeDependsBowControlPoint({ x: a.x, y: a.y }, { x: b.x, y: b.y }, tokens.edgeBowDepends)
        : computeBowControlPoint(
            { x: a.x, y: a.y },
            { x: b.x, y: b.y },
            tokens.edgeBowContains,
            tokens.edgeBlendContains,
          );
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
      level: containmentLevelFor(a.kind, b.kind),
      relationType: edge.relationType,
      declaredBySlug: edge.declaredBySlug ?? null,
    });
  }

  // magnitude = size + fullDegree*18, ported from the prototype's `count +
  // degree*18` — the adapter has no separate "count" field, `size` is its
  // closest analog (follow-up: confirm with the HomePage adapter contract).
  const ranked = [...nodes].sort((x, y) => y.size + y.fullDegree * 18 - (x.size + x.fullDegree * 18));
  const brightStarIds = new Set(ranked.slice(0, Math.max(0, Math.round(tokens.starCount))).map((n) => n.id));

  return {
    nodes: worldNodes,
    nodeById,
    edges: worldEdges,
    neighborMap,
    brightStarIds,
    bounds: computeFullBounds(worldNodes, tokens),
    spineBounds: computeSpineBounds(worldNodes, tokens),
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
    const control =
      edge.kind === "depends"
        ? computeDependsBowControlPoint({ x: a.x, y: a.y }, { x: b.x, y: b.y }, tokens.edgeBowDepends)
        : computeBowControlPoint(
            { x: a.x, y: a.y },
            { x: b.x, y: b.y },
            tokens.edgeBowContains,
            tokens.edgeBlendContains,
          );
    edge.controlX = control.x;
    edge.controlY = control.y;
  }

  const full = accumulateBounds(world.nodes, tokens);
  if (full) {
    world.bounds.minX = full.minX;
    world.bounds.minY = full.minY;
    world.bounds.maxX = full.maxX;
    world.bounds.maxY = full.maxY;
  }
  const spine = computeSpineBounds(world.nodes, tokens);
  world.spineBounds.minX = spine.minX;
  world.spineBounds.minY = spine.minY;
  world.spineBounds.maxX = spine.maxX;
  world.spineBounds.maxY = spine.maxY;
}
