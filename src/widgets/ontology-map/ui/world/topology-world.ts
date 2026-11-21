/**
 * Builds the per-mount "world" (deterministic layout, adjacency, bow control points, brightness
 * ranking) from the adapter's node/edge props. Recomputed only when the graph itself changes (mount,
 * `relayoutToken`, or a new `nodes`/`edges` reference), never per animation frame
 * (`model/layout/layout.ts`'s own contract).
 */
import { DEFAULT_EXPAND } from "@/shared/lib/preferences/appearance-preferences";
import type { ExpandStructure } from "@/shared/lib/preferences/appearance-preferences";
import type { DialModel, DialWorld, DialWorldInput } from "../../dial/types";
import { drainSteps, type LayoutSteps } from "../../flat-graph/layout";
import { computeConcentricLayout, type LayoutGraphNode, type LayoutRings } from "../../model/layout/layout";
import { fireflySeed } from "../../render/edge-fireflies";
import type { OntologyMapTokens } from "../../tokens/read-map-tokens";
import type { OntologyMapEdge, OntologyMapNode } from "../OntologyMap";
import { buildDialWorld } from "./assembly/build-dial-world";
import { resolveContainsParents } from "./assembly/contains-parents";
import { computeRelaxScope } from "./framing/density-fold";
import { computeFullBounds, computeSpineBounds, extentBounds } from "./framing/world-bounds";
import { computeEdgeControlPoint } from "./world-geometry";

export type WorldNodeKind = "project" | "domain" | "capability" | "element";

export interface WorldNode {
  id: string;
  kind: WorldNodeKind;
  /** Raw authorship source (`created_by`): `human`, `agent:<name>`, or absent. Absent is unknown. */
  createdBy?: string;
  label: string;
  x: number;
  y: number;
  /**
   * The deterministic layout coordinate from THIS build pass, cached
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
  /** Adapter contract (`OntologyMapNode`) has no staleness signal yet — always false until a follow-up adds one. */
  stale: boolean;
  /**
   * Transitive descendant count, engraved as a numeral on project/domain chips in circuit range (0 = skip). This node badge equals the total descendant count
   * (`OntologyMapNode.descendantCount`) and shares its source with the cluster chip hover tooltip's "Total N descendants", so the two numbers agree.
   */
  count: number;
  /**
   * The magnitude factor (computed once at build); only domain and capability differ from 1. The draw, the hit test and the de-pileup relaxation all multiply by it,
   * so they cannot diverge. It is the √ scale of the direct child count (never below base, capped at +40%): size is pre-attentive ("where is it big?"), the badge is for reading.
   */
  magnitudeScale: number;

}

export interface WorldEdge {
  /** Original graph edge identity. Embed fixtures can be omitted. */
  id?: string;
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
   * Containment depth from the endpoint kinds: 0 = a skeleton edge with a project, 1 = intermediate structure with a domain, 2 = a capability/element twig. The renderer rides an
   * ink-intensity ramp (weight × lightness) off it, since hierarchy is ordinal (`edge-hierarchy-ink.md`); a `depends` edge belongs to the type channel (dashed) and ignores it.
   */
  level: 0 | 1 | 2;
  /** The original relation type (its meaning before being flattened to contains/depends). */
  relationType: string;
  /** The vault document slug that declared this relation (shown as the source in the edge popover). */
  declaredBySlug: string | null;
  evidenceCount?: number;
}

/**
 * Magnitude-proportional node size: the domain/capability radius is interpolated by the √ scale of the direct child count,
 * `1 + k×(√childCount − 1)/√maxChildCount`, clamped at +40% (1.4), base (1.0) for childCount ≤ 1; element and project stay 1.
 * The √ compresses large gaps while keeping the rank cue; size is a different channel from the badge number (`descendantCount`).
 */
export function computeMagnitudeScale(
  kind: WorldNodeKind,
  childCount: number,
  maxChildCount: number,
  k: number): number {
  if (kind !== "domain" && kind !== "capability") return 1;
  if (maxChildCount <= 0 || childCount <= 0 || k <= 0) return 1;
  const raw = 1 + (k * (Math.sqrt(childCount) - 1)) / Math.sqrt(maxChildCount);
  return Math.min(1.4, Math.max(1, raw));
}

/** Derive the containment ink level from the two endpoint kinds. */
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
 * Per-parent cluster chip placement metadata: `angle` is the layout fan's direction (static, from the home coordinates), `ring` the child-ring radius the chip sits on.
 * The chip's world anchor is recomputed every frame from the parent's live position plus this direction (`topology-cluster-state.ts`).
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
   * node id → indices into `edges` of every edge touching that node (both directions). Static: `edges` is never structurally mutated after the build.
   * It lets a frame that moved ~30 nodes refresh ~60 edges instead of ~3000 (`recomputeWorldGeometry`'s `movedIds` path).
   */
  edgeIndexByNode: ReadonlyMap<string, readonly number[]>;
  /** Top `starCount` nodes by magnitude — get the far-field diffraction-spike overlay. */
  brightStarIds: ReadonlySet<string>;
  /** Bbox of ALL nodes — used for pan clamping and focus-mode context. */
  bounds: Bounds;
  /**
   * Bbox of just the level-0 SPINE (project + domain + hub), recomputed with `bounds`. The overview draws only the spine (`tier-visibility.ts`), so fitting the full
   * `bounds`, which the de-pileup spreads across all nodes, would zoom the ~8 visible spine nodes down to a dot. It holds the hub even when the density gate folds it,
   * so it is the pan clamp's envelope, not a frame: the overview camera fits the part that is drawn (`computeDrawnSpineBounds`).
   */
  spineBounds: Bounds;
  dial?: DialWorld | null;
  dialScaleMax?: number | null;
}

export function buildTopologyWorld(...args: Parameters<typeof buildTopologyWorldSteps>): TopologyWorld {
  return drainSteps(buildTopologyWorldSteps(...args));
}

/** Edges the world's tail turns into geometry between two steps. */
const TAIL_EDGES_PER_STEP = 4000;

/**
 * `buildTopologyWorld` in steps: one per flat-graph cluster in each pass and per domain ForceAtlas2 iteration,
 * one per tail pass and `TAIL_EDGES_PER_STEP` edges. Domain ordering, spreading the domains and
 * reading the containment tree each remain one step.
 */
export function* buildTopologyWorldSteps(
  nodes: readonly OntologyMapNode[],
  edges: readonly OntologyMapEdge[],
  tokens: OntologyMapTokens,
  /**
   * How the children of an over-threshold parent are laid out (settings "Expand → Expand structure"); omitted means `"disc"`, the spiral disc.
   * Changing it rebuilds the world, since the seed coordinates differ (it is in the world-build effect's deps in `use-topology-loop`).
   */
  expandStructure: ExpandStructure = DEFAULT_EXPAND.structure,
  dialInput: DialWorldInput | null = null,
  placeDial: ((model: DialModel) => DialModel) | null = null): LayoutSteps<TopologyWorld> {
  const containsParentById = resolveContainsParents(nodes, edges);

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
  yield;
  const dial = dialInput ? yield* buildDialWorld(nodes, edges, dialInput, placeDial) : null;
  yield;
  const pointById = new Map<string, { x: number; y: number;
    }>();
  if (dial && nodes.every((n) => dial.scene.positions.has(n.id))) {
    for (const n of nodes) pointById.set(n.id, dial.scene.positions.get(n.id)!);
  } else {
    // The relaxation scope is the nodes that can be drawn in this vault: a subtree behind a density-gate chip is never drawn, so no time is spent unpiling it, while seed
    // coordinates are computed for everything. `expandedParents` is deliberately not passed: the world is rebuilt only when the graph changes, and rebuilding on every
    // expansion resets the entry ramps and springs and makes the screen jump; expanded children appear at their seed positions.
    const relaxScope = computeRelaxScope(layoutInput);
    // Feed the real §2.3 node radii into the deterministic de-pileup so its
    // collision min-distance matches what actually gets drawn.
    const seeded = computeConcentricLayout(layoutInput, rings, {
      radii: {
        project: tokens.radiusProject,
        domain: tokens.radiusDomain,
        capability: tokens.radiusCapability,
        element: tokens.radiusElement,
      },
      relaxScope,
      expandStructure,
    });
    for (const p of seeded) pointById.set(p.id, dial?.scene.positions.get(p.id) ?? p);
  }

  yield;
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
      // Stale state from vault mtime feeds the stale visual channel in `freshness.ts`.
      stale: n.stale ?? false,
      count: n.descendantCount,
      magnitudeScale: 1, // Filled by the second pass below, once maxCount is settled.
      starMagnitude: 0, // Filled once the graph's brightest node is known.

    };
  });
  const nodeById = new Map(worldNodes.map((n) => [n.id, n]));
  yield;

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
  yield;
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

  // The magnitude factor's second pass: a √ scale over the direct child
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

  yield;
  const worldEdges: WorldEdge[] = [];
  let edgesSinceYield = 0;
  for (const edge of edges) {
    if ((edgesSinceYield += 1) === TAIL_EDGES_PER_STEP) {
      edgesSinceYield = 0;
      yield;
    }
    const a = nodeById.get(edge.source);
    const b = nodeById.get(edge.target);
    if (!a || !b) continue;
    addNeighbor(a.id, b.id);
    const control = computeEdgeControlPoint(edge.kind, a, b, tokens);
    worldEdges.push({
      id: edge.id,
      sourceId: a.id,
      targetId: b.id,
      kind: edge.kind,
      ax: a.x,
      ay: a.y,
      bx: b.x,
      by: b.y,
      controlX: control.x,
      controlY: control.y,
      // Permanent comets: a deterministic seed staggers the phase to avoid
      // lockstep (every comet flowing at the same phase as one wave). Meaningless
      // for contains, which has no comets.
      t: fireflySeed(a.id, b.id),
      level: containmentLevelFor(a.kind, b.kind),
      relationType: edge.relationType,
      declaredBySlug: edge.declaredBySlug ?? null,
      evidenceCount: edge.evidenceCount,
    });
  }

  // magnitude = size + fullDegree*18; the adapter has no separate "count" field, so `size` stands in.
  yield;
  const rawMagnitude = (n: { size: number; fullDegree: number;
    }) => n.size + n.fullDegree * 18;
  const ranked = [...nodes].sort((x, y) => rawMagnitude(y) - rawMagnitude(x));
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
  yield;

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
    spineBounds: dial ? extentBounds(dial) : computeSpineBounds(worldNodes, tokens),
    dial,
    dialScaleMax: dial && dialInput
      ? Math.max(dialInput.tokens.reachCap / dialInput.tokens.pitch, dialInput.tokens.reachElement / dial.scene.medianElementPitch)
      : null,
  };
}

