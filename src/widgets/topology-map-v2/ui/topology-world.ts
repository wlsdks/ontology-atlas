/**
 * Builds v2's per-mount "world" — deterministic layout + adjacency + bow
 * control points + brightness ranking — from the adapter's node/edge props
 * (`docs/TOPOLOGY-V2-DESIGN.md` §4 P2/P3). Recomputed only when the graph
 * itself changes (mount, `relayoutToken`, or a new `nodes`/`edges` reference)
 * — never per animation frame, matching the prototype's "layout precomputed
 * once" invariant (`model/layout.ts`'s own contract).
 */

import { DEFAULT_EXPAND } from "@/shared/lib/appearance-preferences";
import type { ExpandStructure } from "@/shared/lib/appearance-preferences";
import { computeDensityGate, type DensityGateParentGeometry } from "../model/density-gate";
import { computeConcentricLayout, type LayoutGraphNode, type LayoutRings } from "../model/layout";
import { computeBowControlPoint, computeDependsBowControlPoint } from "../render/traces";
import { fireflySeed } from "../render/edge-fireflies";
import type { TopologyV2Tokens } from "../tokens/read-topology-v2-tokens";
import type { TopologyV2Edge, TopologyV2Node } from "./TopologyMapV2";

export type WorldNodeKind = "project" | "domain" | "capability" | "element";

export interface WorldNode {
  id: string;
  kind: WorldNodeKind;
  /**
   * The raw authorship source (`created_by`) — `human` · `agent:<name>` · absent.
   * Absent is unknown, not a human (ledger 2026-07-31).
   */
  createdBy?: string;
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
  /** The single (primary) contains parent id — where the density gate files a
   *  collapse. A node shared by several parents keeps only the parent of the last
   *  contains edge (the realm uncluster rule uses it to decide "is the collapsing
   *  parent outside the realm"). */
  parentId: string | null;
  isHub: boolean;
  fresh: boolean;
  /** Adapter contract (`TopologyV2Node`) has no staleness signal yet — always false until a follow-up adds one. */
  stale: boolean;
  /**
   * Transitive descendant count — engraved as a numeral on project/domain chips
   * in circuit range (0 = skip). The panel3-S6 number contract: this **node badge =
   * total descendant count** (`TopologyV2Node.descendantCount` = the inventory
   * total). It shares its source with the cluster chip hover tooltip's "하위 전체 N"
   * (N descendants in total), so the two surfaces' numbers agree without drift.
   */
  count: number;
  /**
   * The magnitude factor (computed once at build). Only domain and capability
   * differ from 1. The draw, the hit test and the de-pileup relaxation all multiply
   * by this value, so the three can never diverge. Shneiderman overview-first: the
   * mark answers the overview's first question, "where is it big?".
   * S2 part 2 — the √ scale of the **direct child count** (never below base, capped
   * at +40%). A different channel from the badge number (descendantCount): size is
   * pre-attentive, the badge is for reading.
   */
  magnitudeScale: number;
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
   * P3a — containment depth (derived from the endpoint kinds): 0 = a skeleton edge
   * with a project on it, 1 = intermediate structure with a domain on it, 2 = a
   * capability/element twig. The renderer rides an ink-intensity ramp (weight ×
   * lightness) off this value — hierarchy is ordinal, so lightness and size are the
   * right channels rather than hue (`edge-hierarchy-ink.md`). A `depends` edge
   * belongs to the type channel (dashed) and does not use this value.
   */
  level: 0 | 1 | 2;
  /** P3b — the original relation type (its meaning before being flattened to contains/depends). */
  relationType: string;
  /** P3b — the vault document slug that declared this relation (shown as the source in the edge popover). */
  declaredBySlug: string | null;
}

/**
 * S2 part 2 — magnitude-proportional node size. The domain/capability radius is
 * interpolated by the √ scale of the **direct child count**:
 * `1 + k×(√childCount − 1)/√maxChildCount`, clamped at +40% (1.4). With
 * childCount ≤ 1 it is base (1.0) — never below base, unlike the old logarithmic
 * compression, which shrank below-median nodes under base. element and project are
 * unchanged (1). The √ compresses large gaps while keeping the rank cue (this is
 * not a bar chart — Shneiderman overview-first). A different channel from the badge
 * number (descendantCount): size is the pre-attentive "where is it big?", the badge
 * is for reading.
 */
export function computeMagnitudeScale(
  kind: WorldNodeKind,
  childCount: number,
  maxChildCount: number,
  k: number,
): number {
  if (kind !== "domain" && kind !== "capability") return 1;
  if (maxChildCount <= 0 || childCount <= 0 || k <= 0) return 1;
  const raw = 1 + (k * (Math.sqrt(childCount) - 1)) / Math.sqrt(maxChildCount);
  return Math.min(1.4, Math.max(1, raw));
}

/** P3a — derive the containment ink level from the two endpoint kinds. */
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

/**
 * Density gate slice (fable's design) — per-parent cluster chip placement metadata.
 * `angle` is the layout fan's direction (derived from the home coordinates,
 * static); `ring` is the child-ring radius the chip sits on. The chip's actual
 * world anchor is recomputed every frame from the parent's *live* position plus
 * this static direction (`topology-cluster-state.ts`).
 */
export interface ClusterParentMeta {
  angle: number;
  ring: number;
}

export interface TopologyWorld {
  nodes: readonly WorldNode[];
  nodeById: ReadonlyMap<string, WorldNode>;
  edges: WorldEdge[];
  neighborMap: ReadonlyMap<string, ReadonlySet<string>>;
  /** contains parent id → array of direct child ids (the density gate's input, static). */
  childrenByParent: ReadonlyMap<string, readonly string[]>;
  /** Density gate chip placement metadata (parents with children only, static). */
  clusterMetaByParent: ReadonlyMap<string, ClusterParentMeta>;
  /**
   * node id → indices into `edges` of every edge touching that node (both
   * directions). Static: `edges` is never structurally mutated after the build
   * (only its per-frame geometry / comet phase fields are). Exists so a frame
   * that moved ~30 nodes can refresh ~60 edges instead of all ~3000
   * (`recomputeWorldGeometry`'s `movedIds` path).
   */
  edgeIndexByNode: ReadonlyMap<string, readonly number[]>;
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
  /**
   * S8 defect 4 — restrict the ego bbox to the realm's members while a realm is
   * expanded. With a realm active, neighbours outside the warding circle sit at
   * fling coordinates (thousands of units from the origin), so measuring the bbox
   * unrestricted wraps those outside neighbours too and shrinks the camera so far
   * that "the screen disappears" (owner report). Given this set, only the focus node
   * plus the neighbours **inside it** enter the bbox, so the focus dive moves only
   * within the warding circle. Omitted means global.
   */
  restrictIds?: ReadonlySet<string> | null,
): Bounds | null {
  const focusNode = world.nodeById.get(focusedSlug);
  if (!focusNode) return null;
  const egoIds = new Set<string>([focusedSlug]);
  for (const id of world.neighborMap.get(focusedSlug) ?? []) {
    if (restrictIds && !restrictIds.has(id)) continue;
    egoIds.add(id);
  }
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

/**
 * S2 part 5B — the radius-padded bbox of an expanded cluster "disc" (the parent
 * plus its direct children's fan). Clicking a chip to expand a parent dives the
 * camera to this bbox so "it expanded" is visible in the viewport (owner report #2:
 * *"확장해도 아무 변화가 안 보임"* — expanding shows no change at all). The same
 * pattern as the ego bbox (`computeEgoBounds`), but holding contains children
 * rather than neighbours. `null` when `parentId` does not resolve or has no children.
 */
export function computeClusterDiscBounds(
  world: Pick<TopologyWorld, "nodeById" | "childrenByParent">,
  tokens: TopologyV2Tokens,
  parentId: string,
  /**
   * High-fanout batch reveal (2026-07) — given, only nodes in this set enter the
   * bbox (the parent plus this batch's children). null or omitted means the parent
   * plus every direct child (zero regression).
   */
  restrictIds?: ReadonlySet<string> | null,
): Bounds | null {
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

/**
 * The de-pileup relaxation's scope = **the nodes the density gate does not collapse**.
 *
 * `computeDensityGate`'s `clusteredIds` needs no geometry — it looks only at the
 * per-parent child count and the threshold. So it can be computed **before** layout,
 * and its result tells us in advance which nodes are never drawn in this vault. Only
 * the chip anchors require geometry, and those are built separately after layout by
 * `computeTopologyClusterState` (no cycle).
 *
 * `expandedParents` is treated as empty here — the world is only built when the
 * graph changes and knows nothing about expansion state. Children revealed by an
 * expansion carry seed coordinates, so no coordinate hole appears.
 */
function computeRelaxScope(layoutInput: readonly LayoutGraphNode[]): ReadonlySet<string> {
  const childrenByParent = new Map<string, string[]>();
  for (const n of layoutInput) {
    if (n.parentId === null) continue;
    const siblings = childrenByParent.get(n.parentId);
    if (siblings) siblings.push(n.id);
    else childrenByParent.set(n.parentId, [n.id]);
  }
  const kindById = new Map(layoutInput.map((n) => [n.id, n.kind as string]));
  const { clusteredIds } = computeDensityGate({
    childrenByParent,
    expandedParents: EMPTY_EXPANDED_PARENTS,
    // Chip anchors are not used here — only `clusteredIds` is needed, and that is geometry-independent.
    parentGeometry: EMPTY_PARENT_GEOMETRY,
    kindOf: (id) => kindById.get(id),
  });
  const scope = new Set<string>();
  for (const n of layoutInput) if (!clusteredIds.has(n.id)) scope.add(n.id);
  return scope;
}

const EMPTY_EXPANDED_PARENTS: ReadonlySet<string> = new Set();
const EMPTY_PARENT_GEOMETRY: ReadonlyMap<string, DensityGateParentGeometry> = new Map();

export function buildTopologyWorld(
  nodes: readonly TopologyV2Node[],
  edges: readonly TopologyV2Edge[],
  tokens: TopologyV2Tokens,
  /**
   * How the children of an over-threshold parent are laid out (settings
   * 「확장 → 확장 구조」 — expand → expand structure). Omitted means `"disc"`, today's
   * spiral disc, so the coordinates are byte-identical. Changing the value requires
   * rebuilding the world, because the seed coordinates themselves differ (it is in
   * the world-build effect's deps in `use-topology-loop`).
   */
  expandStructure: ExpandStructure = DEFAULT_EXPAND.structure,
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
  // The relaxation scope = **the nodes that can be drawn in this vault**. A subtree
  // the density gate collapses (under a parent with more than 12 children) hides
  // behind a chip and is never drawn once, so no time is spent unpiling it. Seed
  // coordinates are still computed for everything, so there is no coordinate hole
  // when a tier opens or a chip expands.
  //
  // `expandedParents` is deliberately not passed — the world is rebuilt only when
  // the graph changes (the `useEffect` in `use-topology-loop.ts`), and rebuilding on
  // every expansion resets the entry ramps and springs, making the screen jump.
  // Expanded children appear at their seed positions, and local re-relaxation is a
  // later slice's job.
  const relaxScope = computeRelaxScope(layoutInput);
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
      relaxScope,
      expandStructure,
    }).map((p) => [p.id, p]),
  );

  const worldNodes: WorldNode[] = nodes.map((n) => {
    const point = pointById.get(n.id);
    const x = point?.x ?? 0;
    const y = point?.y ?? 0;
    return {
      id: n.id,
      kind: n.kind,
      createdBy: n.createdBy,
      label: n.label,
      x,
      y,
      homeX: x,
      homeY: y,
      parentId: containsParentById.get(n.id) ?? null,
      isHub: n.isHub,
      fresh: n.recentlyUpdated,
      // Living-map drift — the adapter's dusty verdict (from vault mtime) is wired
      // into the existing stale visual channel (freshness.ts: dash [3,3] plus an opaque token).
      stale: n.stale ?? false,
      count: n.descendantCount,
      magnitudeScale: 1, // Filled by the second pass below, once maxCount is settled.

    };
  });
  const nodeById = new Map(worldNodes.map((n) => [n.id, n]));

  const neighborMap = new Map<string, Set<string>>();
  for (const n of worldNodes) neighborMap.set(n.id, new Set());
  const addNeighbor = (a: string, b: string) => {
    neighborMap.get(a)?.add(b);
    neighborMap.get(b)?.add(a);
  };

  // Density gate slice (fable's design) — build the contains parent→children map
  // and the chip placement metadata statically. Child order follows `nodes` order
  // (deterministic).
  const childrenByParent = new Map<string, string[]>();
  for (const node of worldNodes) {
    const parentId = containsParentById.get(node.id);
    if (parentId === undefined) continue;
    const list = childrenByParent.get(parentId);
    if (list) list.push(node.id);
    else childrenByParent.set(parentId, [node.id]);
  }
  const clusterMetaByParent = new Map<string, ClusterParentMeta>();
  for (const [parentId, childIds] of childrenByParent) {
    const parent = nodeById.get(parentId);
    if (!parent) continue;
    // The outward direction = the parent's parent → the parent (home coordinates,
    // static). For a domain the grandparent is the project (near the origin), so it
    // matches the direction from the origin to the domain.
    const grandParentId = containsParentById.get(parentId);
    const gp = grandParentId ? nodeById.get(grandParentId) : undefined;
    const gx = gp?.homeX ?? 0;
    const gy = gp?.homeY ?? 0;
    const angle = Math.atan2(parent.homeY - gy, parent.homeX - gx);
    const firstChild = nodeById.get(childIds[0]);
    const ring =
      firstChild?.kind === "capability" ? tokens.layoutRingCapability : tokens.layoutRingElement;
    clusterMetaByParent.set(parentId, { angle, ring });
  }

  // S2 part 2 — the magnitude factor's second pass: a √ scale over the direct child
  // count (childrenByParent). maxChildCount looks only at the kinds that scale
  // (domain/capability) — a project's child count would distort the normalising
  // denominator, so it is excluded.
  {
    const childCountOf = (id: string) => childrenByParent.get(id)?.length ?? 0;
    let maxChildCount = 0;
    for (const node of worldNodes) {
      if (node.kind === "domain" || node.kind === "capability") {
        maxChildCount = Math.max(maxChildCount, childCountOf(node.id));
      }
    }
    for (const node of worldNodes) {
      node.magnitudeScale = computeMagnitudeScale(node.kind, childCountOf(node.id), maxChildCount, tokens.radiusMagnitudeK);
    }
  }

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
      // R6 permanent comets — a deterministic seed staggers the phase to avoid
      // lockstep (every comet flowing at the same phase as one wave). Meaningless
      // for contains, which has no comets.
      t: fireflySeed(a.id, b.id),
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

  // Node → the index of the edges attached to it. Built once at build time, it makes
  // the frame path that refreshes «only the moved nodes' edges» possible
  // (`recomputeWorldGeometry`).
  const edgeIndexByNode = new Map<string, number[]>();
  const indexEdge = (nodeId: string, edgeIndex: number) => {
    const list = edgeIndexByNode.get(nodeId);
    if (list) list.push(edgeIndex);
    else edgeIndexByNode.set(nodeId, [edgeIndex]);
  };
  for (let i = 0; i < worldEdges.length; i += 1) {
    indexEdge(worldEdges[i].sourceId, i);
    indexEdge(worldEdges[i].targetId, i);
  }

  return {
    nodes: worldNodes,
    nodeById,
    edges: worldEdges,
    edgeIndexByNode,
    neighborMap,
    childrenByParent,
    clusterMetaByParent,
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
  // **Iterate over what was given.** This used to walk all 3000 of the world's nodes
  // calling `positions.get`, while a throttled tick actually moved a few dozen of
  // them. With the map carrying only those few dozen
  // (`force-layout.ts#positions(only)`), this loop runs only that many times. The
  // meaning is identical — a node absent from the map kept its coordinates before too.
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
function recomputeEdgeGeometry(world: TopologyWorld, tokens: TopologyV2Tokens, edge: WorldEdge): void {
  const a = world.nodeById.get(edge.sourceId);
  const b = world.nodeById.get(edge.targetId);
  if (!a || !b) return;
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

/** Merge one node's radius-padded box into an existing bbox (grow only — never shrink). */
function growBounds(bounds: Bounds, node: WorldNode, tokens: TopologyV2Tokens): void {
  const r = radiusForKind(node.kind, tokens);
  if (node.x - r < bounds.minX) bounds.minX = node.x - r;
  if (node.x + r > bounds.maxX) bounds.maxX = node.x + r;
  if (node.y - r < bounds.minY) bounds.minY = node.y - r;
  if (node.y + r > bounds.maxY) bounds.maxY = node.y + r;
}

/**
 * The partial refresh when only the moved nodes were given.
 *
 * - **Edges**: only those attached to a moved node (`edgeIndexByNode`). An edge with
 *   both ends moved is computed twice, but the operation is idempotent so the result
 *   is the same — building a dedupe Set every frame costs more than that duplication.
 * - **bbox**: grow only. It is the pan clamp's input, so «slightly generous» is the
 *   safe direction (it never crops the user), and the exact shrink is restored by
 *   the full recompute on the frame the drag ends (the settle-end block in
 *   `use-topology-loop.ts`).
 */
function recomputeMovedGeometry(world: TopologyWorld, tokens: TopologyV2Tokens, movedIds: ReadonlySet<string>): void {
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
 * Recomputes edge endpoints + bow control points and the world bounds from the
 * current (force-updated) node positions. Called each frame while the sim is
 * warm — the "layout precomputed once" invariant only held while positions were
 * static; a living graph refreshes derived geometry per frame.
 *
 * `movedIds` scopes the pass to the nodes that actually changed this frame.
 * Omit it (or pass null) for the exact full pass — that is what the homing /
 * relayout / `relaxNewlyVisible` paths want, since they move everything.
 *
 * ⚠️ **A missing id is an immediately visible defect**: the edge keeps last
 * frame's endpoint and visibly detaches from its node. The caller must derive
 * the set from the positions it actually wrote, not from the set it *intended*
 * to move — the drag frame moves nodes through three different writers (force
 * apply, neighbor tug, overlap relaxation) and the tug alone reaches nodes the
 * force tick deliberately excluded.
 */
export function recomputeWorldGeometry(
  world: TopologyWorld,
  tokens: TopologyV2Tokens,
  movedIds?: ReadonlySet<string> | null,
): void {
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
  const spine = computeSpineBounds(world.nodes, tokens);
  world.spineBounds.minX = spine.minX;
  world.spineBounds.minY = spine.minY;
  world.spineBounds.maxX = spine.maxX;
  world.spineBounds.maxY = spine.maxY;
}
