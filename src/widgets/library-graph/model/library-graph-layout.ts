import Graph from "graphology";
import forceAtlas2 from "graphology-layout-forceatlas2";

import { MOTION_EASE } from "@/shared/motion";

import type { LibraryGraph } from "./build-library-graph";

/**
 * Where the dots go — **ForceAtlas2, run to a stop before anything is drawn**.
 *
 * The map's engine is not reused and could not be: it lays out an ontology in tiers
 * (project → domain → capability → element) around rings whose radii encode kind, and
 * this graph has no tiers. What it does share is the library Graphology already
 * supplies for the map's own force pass (`graphology-layout-forceatlas2`, MIT), so this
 * canvas adds no dependency.
 *
 * **The layout is computed once, synchronously, and never ticks.** A live force
 * simulation is a screen that keeps moving after a person has begun reading it, and in
 * a 320px section beside a document that is noise, not life. The animation a person
 * sees is one settle from the seed ring into the finished positions — the picture
 * arriving, not the physics running.
 *
 * **Determinism is a product property, not a nicety.** Seeds are a fixed ring in node
 * order and FA2 is integrated a fixed number of times, so the same folder draws the
 * same picture on every mount. A graph that rearranged itself on each visit would make
 * "the shape of my library" un-learnable, and would make every screenshot a different
 * screenshot.
 */

export interface LayoutPoint {
  x: number;
  y: number;
}

export interface LibraryGraphLayout {
  /** Where each node starts the settle: the seed ring, in world units. */
  seeds: Map<string, LayoutPoint>;
  /** Where each node ends it: the settled ForceAtlas2 result, in world units. */
  settled: Map<string, LayoutPoint>;
}

/**
 * Integration steps.
 *
 * 120 is the point where the picture stops changing shape on the folders measured here;
 * beyond it nodes drift without regrouping. It is also what keeps the 500-node budget:
 * the cost is linear in iterations, so this number is the one lever between "settled"
 * and "still moving when the frame is due" (measured: 500 nodes, 375 edges, 95ms).
 */
const LIBRARY_GRAPH_ITERATIONS = 120;

/**
 * The budget is one interaction frame, so beyond a point a bigger graph buys **fewer
 * passes**, not more time. 600 is where 120 iterations still fit comfortably; past it
 * the count falls in proportion, with a floor of 40 below which the picture stops being
 * a layout at all. A folder that large is an overview of an overview, and a person
 * looking at it is reading shape, not positions.
 */
function iterationsFor(order: number): number {
  if (order <= 600) return LIBRARY_GRAPH_ITERATIONS;
  return Math.max(40, Math.round((LIBRARY_GRAPH_ITERATIONS * 600) / order));
}

/**
 * Order at which Barnes-Hut approximation starts paying for itself — **measured, not
 * assumed**. At 500 nodes the exact pass took 104ms and the approximated one 131ms
 * (M-series laptop, 120 iterations): the quad-tree costs more than the repulsion it
 * saves until the graph is much bigger. Below this the exact pass is both faster and
 * more accurate, so approximating early would have been slower *and* worse.
 */
const BARNES_HUT_ORDER = 800;

/** World radius of the seed ring. Arbitrary but fixed: everything is fitted to the box later. */
const SEED_RADIUS = 180;

/**
 * The seed ring — a golden-angle spiral rather than a plain circle.
 *
 * A plain circle puts every node the same distance from the centre, which gives the
 * force pass a symmetric start and, on a graph with one dominant hub, a symmetric
 * (and therefore slow) escape from it. The spiral breaks that symmetry deterministically
 * and starts the settle from something that already reads as a graph rather than a dial.
 */
export function seedPositions(ids: readonly string[]): Map<string, LayoutPoint> {
  const golden = Math.PI * (3 - Math.sqrt(5));
  const out = new Map<string, LayoutPoint>();
  ids.forEach((id, index) => {
    const angle = index * golden;
    const radius = SEED_RADIUS * Math.sqrt((index + 0.5) / Math.max(1, ids.length));
    out.set(id, { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius });
  });
  return out;
}

/**
 * Runs the force pass. Pure: same input, same output, no clock and no canvas.
 *
 * Edges are undirected here even though both relations have a direction, because
 * attraction is symmetric — a page pulls its source as hard as the source pulls the
 * page. Direction is carried by what the nodes *are* (an edge always leaves a page),
 * not by an arrowhead, so nothing is lost.
 */
export function layoutLibraryGraph(
  graph: LibraryGraph,
  options?: { iterations?: number },
): LibraryGraphLayout {
  const ids = graph.nodes.map((node) => node.id);
  const seeds = seedPositions(ids);
  if (ids.length === 0) return { seeds, settled: new Map() };

  const model = new Graph({ type: "undirected", multi: false });
  for (const node of graph.nodes) {
    const seed = seeds.get(node.id) ?? { x: 0, y: 0 };
    model.addNode(node.id, { x: seed.x, y: seed.y });
  }
  for (const edge of graph.edges) {
    if (!model.hasNode(edge.source) || !model.hasNode(edge.target)) continue;
    if (!model.hasEdge(edge.source, edge.target)) model.addEdge(edge.source, edge.target);
  }

  forceAtlas2.assign(model, {
    iterations: options?.iterations ?? iterationsFor(model.order),
    settings: {
      ...forceAtlas2.inferSettings(model),
      // A source cited by many pages should sit where those pages can all reach it;
      // `outboundAttractionDistribution` is what keeps a hub from being dragged into
      // one of its neighbours.
      outboundAttractionDistribution: true,
      barnesHutOptimize: model.order >= BARNES_HUT_ORDER,
      adjustSizes: false,
    },
  });

  const settled = new Map<string, LayoutPoint>();
  model.forEachNode((id, attributes) => {
    const x = Number(attributes.x);
    const y = Number(attributes.y);
    // A node in its own component with no neighbour can be pushed to a non-finite
    // coordinate by repulsion alone. Falling back to its seed keeps it on the canvas
    // instead of collapsing the whole fit to one point.
    settled.set(id, Number.isFinite(x) && Number.isFinite(y) ? { x, y } : (seeds.get(id) ?? { x: 0, y: 0 }));
  });
  return { seeds, settled: alignToLongestAxis(settled) };
}

/**
 * Turns the settled picture so its **longest direction runs along the canvas's longest
 * direction** — a rigid rotation about the centroid, so every distance and every angle
 * between nodes survives it exactly.
 *
 * ForceAtlas2 has no idea what shape it is being drawn into, and the section's canvas is
 * a wide band (1144 × 320 at 1512px). A layout that happens to settle on a diagonal is
 * then fitted by its height and leaves the whole width empty.
 *
 * ⚠️ **It buys less than the first measurement claimed.** A bench on a synthetic ordering
 * read 9.7% → 60.0% of the available width; the shipped picture measures **33.5%** at
 * 1512, because the rotated cloud's aspect is about 1.39 and the box's is 3.56, and
 * 1.39/3.56 is what fill can be under a uniform fit. The rotation still guarantees that
 * ratio instead of something arbitrarily worse (design-infoviz, 2026-09-06, who measured
 * the rendered pixels rather than the bench).
 *
 * The alternative, stretching x and y by different amounts, would have filled the box
 * too and lied about every distance while doing it. Rotation is the only operation here
 * that buys space without changing what the picture says.
 *
 * The angle is the principal axis of the point cloud (the eigenvector of its covariance
 * matrix, in closed form for 2×2), so it is deterministic and needs no search.
 */
export function alignToLongestAxis(
  points: ReadonlyMap<string, LayoutPoint>,
): Map<string, LayoutPoint> {
  const out = new Map<string, LayoutPoint>();
  if (points.size < 2) return new Map(points);
  let sumX = 0;
  let sumY = 0;
  for (const point of points.values()) {
    sumX += point.x;
    sumY += point.y;
  }
  const centreX = sumX / points.size;
  const centreY = sumY / points.size;
  let xx = 0;
  let yy = 0;
  let xy = 0;
  for (const point of points.values()) {
    const dx = point.x - centreX;
    const dy = point.y - centreY;
    xx += dx * dx;
    yy += dy * dy;
    xy += dx * dy;
  }
  const angle = 0.5 * Math.atan2(2 * xy, xx - yy);
  const cos = Math.cos(-angle);
  const sin = Math.sin(-angle);
  const rotated: Array<[string, LayoutPoint]> = [];
  for (const [id, point] of points) {
    const dx = point.x - centreX;
    const dy = point.y - centreY;
    rotated.push([id, { x: dx * cos - dy * sin, y: dx * sin + dy * cos }]);
  }
  /*
   * **A principal axis has no direction**, only an orientation: the same cloud can come
   * back mirrored or a quarter-turn over, and one page added to a folder could flip the
   * whole picture. Determinism per input is not the property this file claims — "the shape
   * of my library" has to be learnable *across* inputs (design-infoviz, 2026-09-06).
   *
   * The third moment fixes the sign: whichever side of the axis carries the longer tail
   * always lands on the same side. It is zero only for a perfectly symmetric cloud, where
   * both orientations are the same picture anyway.
   */
  const skew = (pick: (point: LayoutPoint) => number): number =>
    rotated.reduce((sum, [, point]) => sum + pick(point) ** 3, 0);
  const flipX = skew((point) => point.x) < 0 ? -1 : 1;
  const flipY = skew((point) => point.y) < 0 ? -1 : 1;
  for (const [id, point] of rotated) {
    out.set(id, { x: centreX + point.x * flipX, y: centreY + point.y * flipY });
  }
  return out;
}

/**
 * World → pixels, **one uniform scale for both axes**.
 *
 * Fitting x and y independently would fill the box exactly and lie about every
 * distance in it: a cluster would look tight vertically and loose horizontally on the
 * same screen. The distance between two dots is the only quantity this picture
 * encodes, so it is the one thing the fit may not distort.
 */
export function fitToBox(
  points: ReadonlyMap<string, LayoutPoint>,
  box: { width: number; height: number; padding: number },
): Map<string, LayoutPoint> {
  const out = new Map<string, LayoutPoint>();
  if (points.size === 0) return out;
  const innerWidth = Math.max(1, box.width - box.padding * 2);
  const innerHeight = Math.max(1, box.height - box.padding * 2);

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const point of points.values()) {
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minY = Math.min(minY, point.y);
    maxY = Math.max(maxY, point.y);
  }
  const spanX = maxX - minX;
  const spanY = maxY - minY;
  // A single node, or a row of nodes on one axis, has zero span there. Scaling by it
  // divides by zero; scale 1 centres them instead, which is what a person expects to see.
  const scale = Math.min(spanX > 0 ? innerWidth / spanX : 1, spanY > 0 ? innerHeight / spanY : 1);
  const centreX = (minX + maxX) / 2;
  const centreY = (minY + maxY) / 2;
  for (const [id, point] of points) {
    out.set(id, {
      x: box.width / 2 + (point.x - centreX) * scale,
      y: box.height / 2 + (point.y - centreY) * scale,
    });
  }
  return out;
}

/**
 * `--motion-ease`, sampled — the entry family every arriving surface in this product
 * takes, evaluated here because a canvas cannot hand a curve to CSS.
 *
 * ⚠️ **The control points come from `MOTION_EASE`, never from four literals.** A JS copy
 * of a CSS motion value is exactly what drifted two ramp steps in 2026-07-28, which is
 * why `src/shared/motion/tokens.ts` holds the one copy and
 * `motion-token-mirror.contract.test.ts` gates it (design-motion, 2026-09-06).
 *
 * Newton's method converges in a handful of steps on this monotone curve.
 */
export function easeMotion(t: number): number {
  const clamped = t <= 0 ? 0 : t >= 1 ? 1 : t;
  const [x1, y1, x2, y2] = MOTION_EASE;
  const curve = (a: number, b: number, u: number): number => {
    const v = 1 - u;
    return 3 * v * v * u * a + 3 * v * u * u * b + u * u * u;
  };
  const slope = (a: number, b: number, u: number): number => {
    const v = 1 - u;
    return 3 * v * v * a + 6 * v * u * (b - a) + 3 * u * u * (1 - b);
  };
  let u = clamped;
  for (let step = 0; step < 6; step += 1) {
    const error = curve(x1, x2, u) - clamped;
    const derivative = slope(x1, x2, u);
    if (Math.abs(error) < 1e-5) break;
    if (Math.abs(derivative) < 1e-6) break;
    u -= error / derivative;
  }
  if (u < 0) u = 0;
  if (u > 1) u = 1;
  return curve(y1, y2, u);
}

/** One frame of the settle: seed → settled at eased progress `t` (0…1). */
export function interpolatePositions(
  seeds: ReadonlyMap<string, LayoutPoint>,
  settled: ReadonlyMap<string, LayoutPoint>,
  t: number,
): Map<string, LayoutPoint> {
  const eased = easeMotion(t);
  const out = new Map<string, LayoutPoint>();
  for (const [id, target] of settled) {
    const from = seeds.get(id) ?? target;
    out.set(id, {
      x: from.x + (target.x - from.x) * eased,
      y: from.y + (target.y - from.y) * eased,
    });
  }
  return out;
}
