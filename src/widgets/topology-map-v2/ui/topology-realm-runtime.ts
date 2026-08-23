/**
 * The realm expansion runtime — at the moment a transition starts it
 * computes the subtree, the re-layout coordinates, the warding geometry and the
 * fling start coordinates in one pass and hands them to `ui/use-topology-loop.ts`.
 * A thin adapter between the pure model (`model/realm.ts`) and the live world
 * (`topology-world.ts`): all the loop does per frame (applying FLIP and fling
 * coordinates) is feed this data to the evaluate functions in
 * `model/realm-transition.ts`.
 */

import type { CameraTarget } from "../engine/camera";
import { fitWorldTarget } from "./topology-camera-math";
import {
  computeRealmLayout,
  computeVisibleBounds,
  computeVisibleWardingRadius,
  extractRealmSubtree,
  realmMaxDepth,
  realmRingsForDepth,
  type RealmBounds,
} from "../model/realm";
import type { LayoutRadii, LayoutRings } from "../model/layout";
import { computeTopologyClusterState } from "./topology-cluster-state";
import { radiusForKind, type TopologyWorld } from "./topology-world";
import type { TopologyV2Tokens } from "../tokens/read-topology-v2-tokens";

/** Content bbox slack (world units) — so the camera fit holds the outermost node comfortably. */
const CONTENT_BOUNDS_MARGIN = 40;

const EMPTY_EXPANDED = new Set<string>();

export interface RealmRuntimeData {
  rootId: string;
  /** Realm member ids (the root included). */
  memberIds: ReadonlySet<string>;
  /** Ids outside the realm — hard-culled after the transition. */
  outsideIds: ReadonlySet<string>;
  /** Each member's re-layout target coordinate (root = origin). */
  insideTargets: ReadonlyMap<string, { x: number; y: number }>;
  /** Each member's transition start coordinate (the FLIP start point). */
  insideFrom: ReadonlyMap<string, { x: number; y: number }>;
  /** Each outside node's transition start coordinate (the fling start point). */
  outsideFrom: ReadonlyMap<string, { x: number; y: number }>;
  /** The gravity centre the fling pushes away from = the root's original (source layout) position. */
  flingCenter: { x: number; y: number };
  /** Centre of the warding circle (world) — the re-layout origin (0,0). */
  wardingCenter: { x: number; y: number };
  /** Warding radius (world). */
  wardingRadius: number;
  /** The realm's re-layout bbox — what the camera fits to. */
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  /**
   * Per-member **depth-based tier kind** — inside a realm the re-layout depth *is*
   * the tier (root = project, level 1 = domain, level 2 = capability, level 3+ =
   * element). Running the tier gate on the original kind hides element children at
   * spine zoom and leaves the realm looking empty (confirmed on the real screen).
   */
  tierKindById: ReadonlyMap<string, "project" | "domain" | "capability" | "element">;
  /**
   * Per-member depth from the root (root = 0). The runtime data the S5 depth
   * treatment reads (FLIP staircase delay · parallax bands · sharpness gradation) —
   * exposed the same way as `tierKindById`. (`tierKindById` flattens depth into four
   * tiers and so cannot tell depth 5 from depth 3; sequencing delays and parallax
   * factors are more accurate judged on the original depth.)
   */
  depthById: ReadonlyMap<string, number>;
  /**
   * S8 defect 2 — the camera keyframe (x, y, scale) from just before realm entry.
   * Leaving a realm tweens back to **these coordinates** rather than the overview
   * fit, returning to "where I was looking" (owner report). The entry effect fills it
   * (it starts null, because the camera is unknown at build time); with an
   * uninitialised camera (a deeplink mount) it stays null and leaving falls back to
   * the overview.
   */
  entryCamera: CameraTarget | null;
}

const DEPTH_TIER_KINDS = ["project", "domain", "capability", "element"] as const;

/** Deterministic per-id fallback angle — the exit direction for an outside node sitting on the centre (no seed). */
function fallbackAngleForId(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  return ((Math.abs(hash) % 1000) / 1000) * Math.PI * 2;
}

export function fallbackAngleFor(id: string): number {
  return fallbackAngleForId(id);
}

/**
 * Visible members (those the density gate did not collapse) → re-layout target
 * coordinates. The density gate is deterministic (`density-gate.ts`), so the same
 * world plus expandedParents always yields the same visible set. The warding radius
 * and bbox computations share this.
 */
function collectVisibleMemberTargets(
  world: TopologyWorld,
  memberIds: ReadonlySet<string>,
  insideTargets: ReadonlyMap<string, { x: number; y: number }>,
  expandedParents: ReadonlySet<string>,
): Array<[string, { x: number; y: number }]> {
  const { clusteredIds } = computeTopologyClusterState(world, expandedParents);
  const out: Array<[string, { x: number; y: number }]> = [];
  for (const id of memberIds) {
    if (clusteredIds.has(id)) {
      // Keep the collapse only when the collapsing parent is a member **inside** the
      // realm — a density gate on an outside parent (a shared element's primary owner,
      // say) cannot hide anything within the realm.
      const parentId = world.nodeById.get(id)?.parentId ?? null;
      if (parentId && memberIds.has(parentId)) continue;
    }
    const t = insideTargets.get(id);
    if (t) out.push([id, t]);
  }
  return out;
}

/**
 * S9 defect 2 — the visible content bbox for the current expansion state. Framing is
 * derived on **the same visible-member basis** as `buildRealmRuntimeData`, so the
 * deselect and entry camera fits do not count collapsed children and over-shrink the
 * view. With no visible member it falls back to `data.bounds`.
 */
export function realmVisibleBounds(
  world: TopologyWorld,
  data: RealmRuntimeData,
  expandedParents: ReadonlySet<string>,
  tokens: TopologyV2Tokens,
): RealmBounds {
  const points: { x: number; y: number }[] = [];
  const reaches: number[] = [];
  let maxNodeRadius = 0;
  for (const [id, t] of collectVisibleMemberTargets(world, data.memberIds, data.insideTargets, expandedParents)) {
    const n = world.nodeById.get(id);
    const nr = n ? radiusForKind(n.kind, tokens) * n.magnitudeScale : 0;
    if (nr > maxNodeRadius) maxNodeRadius = nr;
    points.push(t);
    reaches.push(Math.hypot(t.x, t.y) + nr);
  }
  const contentBounds = computeVisibleBounds(points, CONTENT_BOUNDS_MARGIN + maxNodeRadius, data.bounds);
  // Framing that includes the warding circle — the union with the warding radius
  // measured over the same visible set (identical to `buildRealmRuntimeData`'s
  // framing contract below).
  return unionWithWardingCircle(contentBounds, computeVisibleWardingRadius(reaches));
}

/**
 * The camera fit bbox = the content bbox ∪ the warding circle's bbox. The warding
 * circle is the realm surface's frame (including the inventory engraved at its
 * bottom), so a clipped one reads as "an accidental arc" (owner report 2026-07-23:
 * *"I can't tell why the circle is there"* — I can't tell why the circle is there). S9's
 * "content is the protagonist, the warding may hang off the edge of the screen" was
 * the contract back when the radius was a phantom that counted collapsed children —
 * now that it is a visible-member radius (S9 defect 2) the warding is content +10%
 * margin, so holding the circle costs no over-shrink. Pure.
 */
function unionWithWardingCircle(bounds: RealmBounds, wardingRadius: number): RealmBounds {
  return {
    minX: Math.min(bounds.minX, -wardingRadius),
    minY: Math.min(bounds.minY, -wardingRadius),
    maxX: Math.max(bounds.maxX, wardingRadius),
    maxY: Math.max(bounds.maxY, wardingRadius),
  };
}

/**
 * Build the transition's start data — extract the subtree from the root, produce
 * depth-based re-layout coordinates, then capture the live world's current
 * coordinates as the FLIP and fling start points. null when `rootId` is not in the
 * world.
 */
export function buildRealmRuntimeData(
  world: TopologyWorld,
  rootId: string,
  tokens: TopologyV2Tokens,
  /**
   * S9 defect 2 — the set of expanded parents at entry time (including the realm root
   * is recommended). It bounds the warding radius and camera bbox to **visible
   * members the density gate did not collapse**, stopping a collapsed child's
   * phyllotaxis coordinates from inflating the circle and the framing. Omitted, every
   * member counts as visible.
   */
  expandedParents: ReadonlySet<string> = EMPTY_EXPANDED,
): RealmRuntimeData | null {
  if (!world.nodeById.has(rootId)) return null;
  // Membership uses the same semantics as the ledger and the datasheet — it walks
  // **every contains edge** so shared (multi-parent) elements come along too.
  // `childrenByParent` is the density gate's single-parent map (last edge takes all),
  // so a shared element primarily owned by another capability dropped out and left
  // "Element 2, and a realm ring that is empty" (owner report 2026-07-23, demonstrated on
  // capability:builder-deep-link-focus).
  const containsChildren = new Map<string, string[]>();
  for (const e of world.edges) {
    if (e.kind !== "contains") continue;
    const list = containsChildren.get(e.sourceId);
    if (list) list.push(e.targetId);
    else containsChildren.set(e.sourceId, [e.targetId]);
  }
  const subtree = extractRealmSubtree(rootId, containsChildren);
  const rings: LayoutRings = realmRingsForDepth(
    realmMaxDepth(subtree),
    { domain: tokens.layoutRingDomain, capability: tokens.layoutRingCapability, element: tokens.layoutRingElement },
    { depth1: tokens.realmFillRadius1, depth2: tokens.realmFillRadius2, depth3: tokens.realmFillRadius3 },
  );
  const radii: LayoutRadii = {
    project: tokens.radiusProject,
    domain: tokens.radiusDomain,
    capability: tokens.radiusCapability,
    element: tokens.radiusElement,
  };
  const layout = computeRealmLayout(subtree, rings, radii);

  const insideTargets = new Map<string, { x: number; y: number }>();
  const insideFrom = new Map<string, { x: number; y: number }>();
  const outsideFrom = new Map<string, { x: number; y: number }>();
  const outsideIds = new Set<string>();

  for (const node of world.nodes) {
    if (subtree.memberIds.has(node.id)) {
      const target = layout.get(node.id) ?? { x: 0, y: 0 };
      insideTargets.set(node.id, { x: target.x, y: target.y });
      insideFrom.set(node.id, { x: node.x, y: node.y });
    } else {
      outsideIds.add(node.id);
      outsideFrom.set(node.id, { x: node.x, y: node.y });
    }
  }

  const root = world.nodeById.get(rootId);
  const flingCenter = { x: root?.homeX ?? 0, y: root?.homeY ?? 0 };

  // S9 defect 2 — the warding radius and camera bbox are measured over **visible
  // members** only (those the density gate did not collapse). Counting collapsed
  // children too (the phyllotaxis disc under a parent with >12 children) pushes the
  // circle off screen and over-shrinks the content frame into "small content, giant circle".
  const visibleMemberPoints: { x: number; y: number }[] = [];
  const reaches: number[] = [];
  let maxNodeRadius = 0;
  for (const [id, t] of collectVisibleMemberTargets(world, subtree.memberIds, insideTargets, expandedParents)) {
    const n = world.nodeById.get(id);
    const nr = n ? radiusForKind(n.kind, tokens) * n.magnitudeScale : 0;
    if (nr > maxNodeRadius) maxNodeRadius = nr;
    visibleMemberPoints.push(t);
    reaches.push(Math.hypot(t.x, t.y) + nr);
  }
  const wardingRadius = computeVisibleWardingRadius(reaches);

  // Camera fit = the visible content bbox ∪ the warding circle's bbox (see the
  // `unionWithWardingCircle` comment — the warding circle is the realm surface's
  // frame, so it is held whole rather than clipped).
  const bounds = unionWithWardingCircle(
    computeVisibleBounds(visibleMemberPoints, CONTENT_BOUNDS_MARGIN + maxNodeRadius, {
      minX: -wardingRadius,
      minY: -wardingRadius,
      maxX: wardingRadius,
      maxY: wardingRadius,
    }),
    wardingRadius,
  );

  return {
    rootId,
    memberIds: subtree.memberIds,
    outsideIds,
    insideTargets,
    insideFrom,
    outsideFrom,
    flingCenter,
    wardingCenter: { x: 0, y: 0 },
    wardingRadius,
    bounds,
    // The entry effect fills this with the camera's current value (unknown here).
    entryCamera: null,
    tierKindById: new Map(
      [...subtree.depthById].map(([id, depth]) => [
        id,
        DEPTH_TIER_KINDS[Math.min(depth, DEPTH_TIER_KINDS.length - 1)],
      ]),
    ),
    depthById: new Map(subtree.depthById),
  };
}

/**
 * The camera fit target for a realm's content bbox — measured against the visible
 * area, safe insets included. It applies the same contract as
 * `computeOverviewCameraTarget` (centring on the visible area) to the realm bbox.
 * Pass `bounds` as `realmVisibleBounds` or `data.bounds` (both visible-member based),
 * so that under S9 defect 2 the warding circle and the framing share one
 * visible-member basis.
 */
export function realmCameraTarget(
  bounds: RealmBounds,
  tokens: TopologyV2Tokens,
  viewportWidth: number,
  viewportHeight: number,
): CameraTarget {
  const insetLeft = tokens.safeInsetLeft;
  const insetRight = tokens.safeInsetRight;
  const insetTop = tokens.safeInsetTop;
  const insetBottom = tokens.safeInsetBottom;
  const effW = Math.max(1, viewportWidth - insetLeft - insetRight);
  const effH = Math.max(1, viewportHeight - insetTop - insetBottom);
  const fit = fitWorldTarget(bounds, effW, effH, tokens.cameraScaleMax, tokens.cameraScaleMin);
  return {
    tx: fit.tx - (insetLeft - insetRight) / (2 * fit.tscale),
    ty: fit.ty - (insetTop - insetBottom) / (2 * fit.tscale),
    tscale: fit.tscale,
  };
}
