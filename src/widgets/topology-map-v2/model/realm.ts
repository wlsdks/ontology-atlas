/**
 * Realm — subtree extraction, depth-remapped re-root layout, and warding-circle
 * geometry.
 *
 * Entering a realm treats the selected node as a temporary root, keeps only its
 * containment subtree, and turns the map into that node's own world. This module
 * holds the **pure geometry** of that switch. Transition motion belongs to
 * `model/realm-transition.ts`; camera and draw wiring to
 * `ui/use-topology-loop.ts`.
 *
 * Why the depth mapping ignores kind: whether the realm root is a capability or
 * a domain, inside that node's world the root *is* the centre and its immediate
 * children *are* the domain ring — otherwise it does not read as "that node's
 * map". So rings are chosen by **depth from the root** (0 → project ring,
 * 1 → domain, 2 → capability, 3+ → element), not by render kind. Render kind
 * (color, shape) is untouched; this module only produces coordinates.
 *
 * Deterministic: the same input (same `childrenByParent` order) always yields
 * the same subtree, coordinates, and radii (`realm.test.ts`). It reuses
 * `computeConcentricLayout` and so inherits that module's determinism — fixed
 * iterations, fixed order, seedless tie-breaks.
 */

import {
  computeConcentricLayout,
  type LayoutGraphNode,
  type LayoutNodeKind,
  type LayoutPoint,
  type LayoutRadii,
  type LayoutRings,
} from "./layout";

export interface RealmSubtree {
  /** Realm root id — the node that becomes the temporary origin. */
  rootId: string;
  /** Every id in the subtree including the root — the containment transitive closure. */
  memberIds: ReadonlySet<string>;
  /** Each member's depth from the root (root = 0). */
  depthById: ReadonlyMap<string, number>;
  /** Each non-root member's containment parent id (the root has none). */
  parentById: ReadonlyMap<string, string>;
}

/**
 * BFS from the root over `childrenByParent` (contains parent → direct children)
 * to collect the transitive closure. `depthById` doubles as the visited mark,
 * which breaks cycles safely. Child order follows input order, so it is
 * deterministic.
 */
export function extractRealmSubtree(
  rootId: string,
  childrenByParent: ReadonlyMap<string, readonly string[]>,
): RealmSubtree {
  const depthById = new Map<string, number>([[rootId, 0]]);
  const parentById = new Map<string, string>();
  const queue: string[] = [rootId];
  let head = 0;
  while (head < queue.length) {
    const parent = queue[head];
    head += 1;
    const depth = depthById.get(parent) ?? 0;
    for (const child of childrenByParent.get(parent) ?? []) {
      if (depthById.has(child)) continue; // already seen — cycle or re-visit
      depthById.set(child, depth + 1);
      parentById.set(child, parent);
      queue.push(child);
    }
  }
  return { rootId, memberIds: new Set(depthById.keys()), depthById, parentById };
}

/**
 * Depth → layout kind. Rings are chosen by depth from the root, not by render
 * kind: 0 = origin, 1 = domain ring, 2 = capability ring, 3+ = element ring.
 * Anything deeper than 3 shares the element ring and still stays separated,
 * because the fan is taken around each parent.
 */
export function realmLayoutKind(depth: number): LayoutNodeKind {
  if (depth <= 0) return "project";
  if (depth === 1) return "domain";
  if (depth === 2) return "capability";
  return "element";
}

/** The depth at which realm rings match the global spine; depth 3+ uses the spine rings unchanged. */
const REALM_FILL_FULL_DEPTH = 3;

/** Deepest level in the subtree (0 when only the root is present). Pure. */
export function realmMaxDepth(subtree: RealmSubtree): number {
  let max = 0;
  for (const d of subtree.depthById.values()) if (d > max) max = d;
  return max;
}

/**
 * Depth-derived realm rings — the shallower the subtree, the further in the
 * depth-1 ring is pulled, which removes the empty annulus. The factor
 * `fill(min(maxDepth, 3)) / base.domain` is applied to all three rings so their
 * proportions are preserved. At maxDepth ≥ 3 the factor is 1, making the
 * coordinates byte-identical to before: no regression for deep realms.
 */
export function realmRingsForDepth(
  maxDepth: number,
  base: LayoutRings,
  fill: { depth1: number; depth2: number; depth3: number },
): LayoutRings {
  const capped = Math.max(1, Math.min(maxDepth, REALM_FILL_FULL_DEPTH));
  const target = capped === 1 ? fill.depth1 : capped === 2 ? fill.depth2 : fill.depth3;
  const s = base.domain > 0 ? target / base.domain : 1;
  return { domain: base.domain * s, capability: base.capability * s, element: base.element * s };
}

/**
 * At or below this many depth-1 children, the whole layout is rotated −90° so
 * the children sit on the **horizontal** axis.
 *
 * Dividing TAU evenly reads as "points that happen to be inside a circle" at
 * N = 1 (a single vertex on top) and N = 2 (a vertical dumbbell), and the
 * vertical edge runs straight through the child labels — owner report
 * 2026-07-23, reproduced on a shallow capability realm. The horizontal
 * composition aligns with the labels (horizontal text) and the reading
 * direction, and leaves the bottom of the circle free for the warding caption.
 * From N ≥ 3 the even division already reads as a deliberate polygon (triangle,
 * diamond), so it is left alone: zero coordinate regression for deep realms.
 */
const REALM_HORIZON_MAX_DEPTH1 = 2;

/**
 * Realm-local coordinates: run the subtree through `computeConcentricLayout` by
 * depth, producing a re-rooted layout with the root at the origin. Render kind
 * is ignored, so expanding an element as the root still puts its direct children
 * on the domain ring.
 *
 * A shallow fan — depth-1 children at or below `REALM_HORIZON_MAX_DEPTH1` —
 * rotates every non-root point −90° about the origin ((x,y) → (y,−x)), putting
 * the first child left and the second right. Being a rigid rotation, the
 * relative geometry (fan, separation, warding radius) is preserved exactly.
 */
export function computeRealmLayout(
  subtree: RealmSubtree,
  rings: LayoutRings,
  radii: LayoutRadii,
): Map<string, LayoutPoint> {
  const layoutInput: LayoutGraphNode[] = [];
  let depth1Count = 0;
  for (const id of subtree.depthById.keys()) {
    const depth = subtree.depthById.get(id) ?? 0;
    if (depth === 1) depth1Count += 1;
    layoutInput.push({
      id,
      kind: realmLayoutKind(depth),
      parentId: id === subtree.rootId ? null : subtree.parentById.get(id) ?? null,
    });
  }
  const points = computeConcentricLayout(layoutInput, rings, { radii });
  if (depth1Count >= 1 && depth1Count <= REALM_HORIZON_MAX_DEPTH1) {
    return new Map(
      points.map((p) => (p.id === subtree.rootId ? [p.id, p] : [p.id, { id: p.id, x: p.y, y: -p.x }])),
    );
  }
  return new Map(points.map((p) => [p.id, p]));
}

/**
 * Warding radius — distance to the realm node furthest from the centre, plus a
 * margin. Pure: same points and margin, same radius. With no points (root only)
 * just the margin remains, giving the smallest circle that wraps the root.
 */
export function computeWardingRadius(
  points: readonly { x: number; y: number }[],
  center: { x: number; y: number },
  margin: number,
): number {
  let maxDist = 0;
  for (const p of points) {
    const d = Math.hypot(p.x - center.x, p.y - center.y);
    if (d > maxDist) maxDist = d;
  }
  return maxDist + margin;
}

/** Visible-member warding margin, as a fraction of the content radius (the furthest edge reach). */
export const WARDING_VISIBLE_MARGIN_RATIO = 0.1;
/** Lower bound on that margin (world units) — wraps at least this much even when only the root is visible. */
export const WARDING_VISIBLE_MIN_MARGIN = 40;

/**
 * Warding radius computed from **only the members actually drawn**.
 *
 * `computeWardingRadius` also counted children folded away by the density
 * threshold — the phyllotaxis disc coordinates under a parent with more than 12
 * children — producing a circle far larger than the visible world: content
 * filling ~40% of the screen inside a warding circle that ran off it. This
 * function takes only the reaches of visible members, which the caller has
 * already filtered, and adds a margin proportional to the content radius (never
 * below the lower bound). A reach is `hypot(node - center) + nodeRadius`, so the
 * circle never clips the body of the outermost node. With no points (root only)
 * just the lower-bound margin remains. Pure.
 */
export function computeVisibleWardingRadius(reaches: readonly number[]): number {
  let outer = 0;
  for (const r of reaches) if (r > outer) outer = r;
  return outer + Math.max(WARDING_VISIBLE_MIN_MARGIN, outer * WARDING_VISIBLE_MARGIN_RATIO);
}

export interface RealmBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/**
 * Bounding box of the visible members (plus a margin). It exists so the camera
 * fit is derived from the **same visible-member basis** as the warding radius,
 * which is what removes the "small content inside a huge circle" mismatch. With
 * no points — the degenerate root-only case — `fallback` is returned unchanged.
 * Pure.
 */
export function computeVisibleBounds(
  points: readonly { x: number; y: number }[],
  margin: number,
  fallback: RealmBounds,
): RealmBounds {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  if (!Number.isFinite(minX)) return fallback;
  return { minX: minX - margin, minY: minY - margin, maxX: maxX + margin, maxY: maxY + margin };
}
