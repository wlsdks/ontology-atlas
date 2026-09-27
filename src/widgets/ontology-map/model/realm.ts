/**
 * Pure realm geometry: subtree extraction, re-rooted layout and ward radius. Rings follow
 * depth from the root, not kind (0 origin, 1 domain, 2 capability, 3+ element), so any
 * root reads as that node's own map; render kind is untouched. Deterministic through
 * `computeConcentricLayout`. Motion is `model/realm-transition.ts`.
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
  rootId: string;
  /** The containment transitive closure, root included. */
  memberIds: ReadonlySet<string>;
  /** root = 0 */
  depthById: ReadonlyMap<string, number>;
  parentById: ReadonlyMap<string, string>;
}

/**
 * BFS over `childrenByParent`, O(N + E); `depthById` doubles as the visited mark, which
 * breaks cycles. Child order follows input order.
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
      if (depthById.has(child)) continue; // already seen: a cycle or a revisit
      depthById.set(child, depth + 1);
      parentById.set(child, parent);
      queue.push(child);
    }
  }
  return { rootId, memberIds: new Set(depthById.keys()), depthById, parentById };
}

/** Deeper than 3 shares the element ring and stays separated, since fans form per parent. */
export function realmLayoutKind(depth: number): LayoutNodeKind {
  if (depth <= 0) return "project";
  if (depth === 1) return "domain";
  if (depth === 2) return "capability";
  return "element";
}

/** From this depth realm rings equal the global spine rings. */
const REALM_FILL_FULL_DEPTH = 3;

/** 0 when only the root is present. */
export function realmMaxDepth(subtree: RealmSubtree): number {
  let max = 0;
  for (const d of subtree.depthById.values()) if (d > max) max = d;
  return max;
}

/**
 * A shallower subtree pulls the depth-1 ring in, removing the empty annulus. One factor
 * scales all three rings; at maxDepth ≥ 3 it is 1 and the coordinates are unchanged.
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
 * At or below this many depth-1 children the layout rotates −90° onto the horizontal axis:
 * one or two children on a vertical line read as stray points and cross their labels. From
 * three the even division already reads as a polygon.
 */
const REALM_HORIZON_MAX_DEPTH1 = 2;

/**
 * A shallow fan rotates every non-root point −90° ((x,y) → (y,−x)), first child left; a
 * rigid rotation, so fan, separation and ward radius are preserved.
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

/** With no points just the margin remains, the smallest circle round the root. */
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

/** Of the content radius (the furthest edge reach). */
export const WARDING_VISIBLE_MARGIN_RATIO = 0.1;
/** Wraps at least this much even when only the root is visible. */
export const WARDING_VISIBLE_MIN_MARGIN = 40;

/**
 * Only drawn members count: folded children would give a ward far larger than the visible
 * world. A reach is `hypot(node - center) + nodeRadius`, so the outermost body is never
 * clipped.
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
 * The camera fit uses the same visible-member basis as the ward radius, so small content
 * never sits in a huge circle. With no points `fallback` is returned unchanged.
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
