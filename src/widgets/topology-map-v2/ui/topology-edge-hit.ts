/**
 * P3b — edge hit testing (pure maths, no DOM or canvas contact).
 *
 * The reference study's ruling (edge-meaning-refs): "an edge is a selectable
 * first-class object with a detail panel" is the industry-standard form
 * (Kumu/Bloom/Foundry), and this module is its first step. A node hit always wins
 * (the caller's contract): edge proximity is judged only at a point where no node
 * was hit.
 *
 * Performance: an AABB pre-pass (hull bbox plus threshold), then only the edges that
 * pass are sampled uniformly along the quadratic bezier and judged by segment-chain
 * distance — measured in the technical review at tens of µs per event for ~500 edges,
 * leaving <1ms of frame budget spare (no spatial partitioning needed).
 */

import type { WorldEdge } from "./topology-world";

interface EdgeHitPoint {
  x: number;
  y: number;
}

const SAMPLE_STEPS = 16;

function distSqToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const vx = bx - ax;
  const vy = by - ay;
  const wx = px - ax;
  const wy = py - ay;
  const len2 = vx * vx + vy * vy;
  const t = len2 > 0 ? Math.min(1, Math.max(0, (wx * vx + wy * vy) / len2)) : 0;
  const cx = ax + vx * t;
  const cy = ay + vy * t;
  const dx = px - cx;
  const dy = py - cy;
  return dx * dx + dy * dy;
}

/** A point on the quadratic bezier (endpoints a/b plus control c) — screen coordinates. */
function bezier(ax: number, ay: number, cx: number, cy: number, bx: number, by: number, t: number): EdgeHitPoint {
  const u = 1 - t;
  return {
    x: u * u * ax + 2 * u * t * cx + t * t * bx,
    y: u * u * ay + 2 * u * t * cy + t * t * by,
  };
}

export interface EdgeHitCandidate {
  edge: WorldEdge;
  /** The screen-space projection — the caller (the pointer handler) owns the world→screen transform. */
  a: EdgeHitPoint;
  b: EdgeHitPoint;
  control: EdgeHitPoint;
  /**
   * Hit-test inversion guard (panel3-S3) — the two end nodes' **screen body radius**
   * (px). The edge anchors (`a`/`b`) are the end nodes' centres, so the span inside
   * this radius is node-body territory. It enforces the "node body > edge" contract
   * geometrically: (1) a click inside an end node's body excludes that edge from hit
   * testing (the node owns it), and (2) bezier samples falling inside a node body are
   * excluded from the distance calculation, so a click on or near a node's centre
   * cannot leak to a radial edge. Omitted keeps the previous behaviour (the whole span
   * is hittable) — backwards compatible for the pure tests.
   */
  aRadius?: number;
  bRadius?: number;
}

function withinRadius(px: number, py: number, cx: number, cy: number, radius: number | undefined): boolean {
  if (radius === undefined || radius <= 0) return false;
  const dx = px - cx;
  const dy = py - cy;
  return dx * dx + dy * dy <= radius * radius;
}

/**
 * The nearest edge within `thresholdPx` of `(screenX, screenY)`, or null. Passing only
 * edges that were actually drawn (survived culling) is the caller's responsibility —
 * clicking an invisible edge is a contract violation.
 *
 * Node priority (panel3-S3): given `aRadius`/`bRadius`, clicks and spans inside that
 * radius (the node body) are excluded from edge hits, blocking the inversion where a
 * node click opens the edge panel.
 */
export function hitTestEdges(
  candidates: readonly EdgeHitCandidate[],
  screenX: number,
  screenY: number,
  thresholdPx: number,
): WorldEdge | null {
  const threshold2 = thresholdPx * thresholdPx;
  let best: WorldEdge | null = null;
  let bestD2 = threshold2;
  for (const { edge, a, b, control, aRadius, bRadius } of candidates) {
    // Node body > edge — a click inside either end node's body belongs to the node, so
    // this edge is dropped from the candidates entirely (cutting the inversion off at the root).
    if (withinRadius(screenX, screenY, a.x, a.y, aRadius) || withinRadius(screenX, screenY, b.x, b.y, bRadius)) {
      continue;
    }
    // AABB pre-pass — skip sampling when the hull bbox is outside the threshold.
    const minX = Math.min(a.x, b.x, control.x) - thresholdPx;
    const maxX = Math.max(a.x, b.x, control.x) + thresholdPx;
    const minY = Math.min(a.y, b.y, control.y) - thresholdPx;
    const maxY = Math.max(a.y, b.y, control.y) + thresholdPx;
    if (screenX < minX || screenX > maxX || screenY < minY || screenY > maxY) continue;

    let prev = bezier(a.x, a.y, control.x, control.y, b.x, b.y, 0);
    let prevInNode = withinRadius(prev.x, prev.y, a.x, a.y, aRadius) || withinRadius(prev.x, prev.y, b.x, b.y, bRadius);
    for (let i = 1; i <= SAMPLE_STEPS; i += 1) {
      const cur = bezier(a.x, a.y, control.x, control.y, b.x, b.y, i / SAMPLE_STEPS);
      const curInNode =
        withinRadius(cur.x, cur.y, a.x, a.y, aRadius) || withinRadius(cur.x, cur.y, b.x, b.y, bRadius);
      // Only spans with both ends outside a node body are measured for hit distance —
      // excluding the edge's tail beside an end node (node territory) keeps a nearby
      // click from leaking to the edge.
      if (!prevInNode && !curInNode) {
        const d2 = distSqToSegment(screenX, screenY, prev.x, prev.y, cur.x, cur.y);
        if (d2 < bestD2) {
          bestD2 = d2;
          best = edge;
        }
      }
      prev = cur;
      prevInNode = curInNode;
    }
  }
  return best;
}
