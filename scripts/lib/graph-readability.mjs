/**
 * Graph readability metrics — **pure computation**. It knows nothing of the browser
 * or the DOM.
 *
 * **Why it was pulled out of the browser.** `/gate-probe`'s rule: **a gate that only
 * ever passes is indistinguishable from no gate.** The first measurement returned 0
 * overlaps in all three cases, and there was no way to tell on the spot whether that
 * 0 meant "the map does not overlap" or "the detector is idling" — because with the
 * computation inside the page, **you cannot feed it an answer you already know**.
 *
 * So the page yields coordinates only and the verdict happens here, where it can be
 * probed with fixtures (`tests/contract/graph-readability.contract.test.ts`).
 *
 * **What is measured, and what is deliberately not.**
 *
 * Purchase, *"Which Aesthetic has the Greatest Effect on Human Understanding?"*
 * (Graph Drawing 1997): **minimising edge crossings mattered overwhelmingly most
 * for human comprehension**, while maximising angular resolution and snapping to a
 * grid were not statistically significant.
 *
 * So only two things are measured — **crossings**, and the prerequisite that comes
 * before crossings, **overlap** (an occluded node is off the screen before it is
 * unreadable). Measuring aesthetics shown to be insignificant grows the number of
 * numbers without growing the verdict; that is a dashboard, not an instrument.
 *
 * The same reasoning rules out the off-the-shelf library (`greadability.js`) — it
 * computes the insignificant axes too, and the two we use are this file.
 * `forbidden.md` requires a reason for every new dependency.
 */

/** How many segments approximate one curve. */
const SAMPLES = 8;

const orient = (ax, ay, bx, by, cx, cy) => {
  const v = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  return v > 1e-9 ? 1 : v < -1e-9 ? -1 : 0;
};

const segmentsCross = (p, q, r, s) =>
  orient(p[0], p[1], q[0], q[1], r[0], r[1]) !== orient(p[0], p[1], q[0], q[1], s[0], s[1]) &&
  orient(r[0], r[1], s[0], s[1], p[0], p[1]) !== orient(r[0], r[1], s[0], s[1], q[0], q[1]);

/**
 * Quadratic Bézier to polyline.
 *
 * **So that the drawn curve is measured, not its chord.** This map's edges are drawn
 * with `quadraticCurveTo`; joining only the endpoints counts crossings that are not
 * on screen and misses crossings that are. With no control point it is treated as a
 * straight line.
 */
function polyline(e) {
  const cx = e.controlX ?? (e.ax + e.bx) / 2;
  const cy = e.controlY ?? (e.ay + e.by) / 2;
  const pts = [];
  for (let i = 0; i <= SAMPLES; i += 1) {
    const t = i / SAMPLES;
    const u = 1 - t;
    pts.push([
      u * u * e.ax + 2 * u * t * cx + t * t * e.bx,
      u * u * e.ay + 2 * u * t * cy + t * t * e.by,
    ]);
  }
  return pts;
}

const sharesEndpoint = (a, b) =>
  a.sourceId === b.sourceId ||
  a.sourceId === b.targetId ||
  a.targetId === b.sourceId ||
  a.targetId === b.targetId;

/**
 * @param {{
 *   nodes: Array<{ id: string, x: number, y: number, radius: number }>,
 *   edges: Array<{ sourceId: string, targetId: string, ax: number, ay: number, bx: number, by: number, controlX?: number, controlY?: number }>,
 *   width: number, height: number,
 * }} input — all coordinates are screen (CSS) pixels.
 */
export function measureReadability({ nodes, edges, width, height }) {
  /** Off-screen geometry is invisible to the user — counting crossings there contaminates the verdict. */
  const onScreen = (x, y, pad = 0) => x >= -pad && y >= -pad && x <= width + pad && y <= height + pad;

  // ── 1. Edge crossings ──────────────────────────────────────────────────
  const visible = edges.filter(
    (e) =>
      onScreen(e.ax, e.ay) ||
      onScreen(e.bx, e.by) ||
      onScreen(e.controlX ?? (e.ax + e.bx) / 2, e.controlY ?? (e.ay + e.by) / 2),
  );
  const polys = visible.map((e) => ({ e, pts: polyline(e) }));
  // Axis-aligned bounding-box prefilter — without it a large vault runs tens of millions of pair comparisons.
  const bbox = polys.map(({ pts }) => {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [x, y] of pts) {
      if (x < x0) x0 = x;
      if (y < y0) y0 = y;
      if (x > x1) x1 = x;
      if (y > y1) y1 = y;
    }
    return [x0, y0, x1, y1];
  });

  let crossings = 0;
  for (let i = 0; i < polys.length; i += 1) {
    for (let j = i + 1; j < polys.length; j += 1) {
      // **Edge pairs sharing an endpoint are not counted.** Two lines from the same node
      // meeting at that node is the definition of a graph, not a crossing — counting it
      // makes any graph with high-degree nodes score badly by construction.
      if (sharesEndpoint(polys[i].e, polys[j].e)) continue;
      const [ax0, ay0, ax1, ay1] = bbox[i];
      const [bx0, by0, bx1, by1] = bbox[j];
      if (ax1 < bx0 || bx1 < ax0 || ay1 < by0 || by1 < ay0) continue;
      let hit = false;
      for (let m = 0; m < SAMPLES && !hit; m += 1) {
        for (let n = 0; n < SAMPLES && !hit; n += 1) {
          if (segmentsCross(polys[i].pts[m], polys[i].pts[m + 1], polys[j].pts[n], polys[j].pts[n + 1])) {
            hit = true;
          }
        }
      }
      if (hit) crossings += 1;
    }
  }

  /**
   * The normalisation ceiling — all edge pairs minus **pairs that share an endpoint
   * and therefore cannot cross in principle**. Quality 1 means no crossings.
   */
  const m = visible.length;
  const degree = new Map();
  for (const e of visible) {
    degree.set(e.sourceId, (degree.get(e.sourceId) ?? 0) + 1);
    degree.set(e.targetId, (degree.get(e.targetId) ?? 0) + 1);
  }
  let impossiblePairs = 0;
  for (const d of degree.values()) impossiblePairs += (d * (d - 1)) / 2;
  const maxCrossings = Math.max(0, (m * (m - 1)) / 2 - impossiblePairs);

  // ── 2. Node overlap ────────────────────────────────────────────────────
  const vis = nodes.filter((n) => n.radius > 0 && onScreen(n.x, n.y, n.radius));
  const sorted = [...vis].sort((a, b) => a.x - b.x); // x sweep — avoids O(n²)
  let overlaps = 0;
  let worstOverlapPx = 0;
  for (let i = 0; i < sorted.length; i += 1) {
    for (let j = i + 1; j < sorted.length; j += 1) {
      const a = sorted[i];
      const b = sorted[j];
      const reach = a.radius + b.radius;
      if (b.x - a.x > reach) break; // Sorted, so everything after this is farther still
      const d = Math.hypot(b.x - a.x, b.y - a.y);
      if (d < reach) {
        overlaps += 1;
        worstOverlapPx = Math.max(worstOverlapPx, reach - d);
      }
    }
  }

  return {
    visibleNodes: vis.length,
    visibleEdges: m,
    crossings,
    maxCrossings,
    /**
     * ★ **The field that stops a vacuous perfect score reading as a perfect score.**
     *
     * Measured, a synthetic 3000-node case produced `crossings 0 / possible 0 →
     * quality 1`. Not because the layout was perfect but **because the density gate had
     * folded the subtrees away, leaving 18 edges in a star on screen** — every edge pair
     * shares an endpoint, so crossings are impossible in principle and the score is
     * perfect. Without this field the instrument reaches the opposite conclusion, "the
     * largest vault is the best".
     */
    crossingMeasurable: maxCrossings > 0,
    crossingQuality: maxCrossings > 0 ? +(1 - crossings / maxCrossings).toFixed(4) : null,
    overlaps,
    /** Overlapping pairs per node — use this to compare cases of different sizes. */
    overlapRate: vis.length > 1 ? +(overlaps / vis.length).toFixed(4) : 0,
    worstOverlapPx: +worstOverlapPx.toFixed(1),
  };
}
