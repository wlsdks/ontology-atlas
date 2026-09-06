import { MOTION_EASE } from "@/shared/motion";

/**
 * The geometry the live simulation is drawn through — **seeds, the fit, and the curve**.
 *
 * ⚠️ **This file used to be the layout.** It ran ForceAtlas2 to a stop, rotated the
 * result onto the canvas's long axis, and handed back two frozen position maps for the
 * caller to interpolate between; the comment at the top of it argued that a live force
 * simulation beside a document is movement with nothing to say. The owner rejected the
 * shipped picture on 2026-09-07 and that argument with it — a settled pass over a folder
 * where six pages cite the same seven sources is a hairball, and a hairball nobody can
 * pull apart is a picture a person can only accept or leave. The physics moved to
 * `library-force-simulation.ts`, and with it went `layoutLibraryGraph`,
 * `alignToLongestAxis`, `iterationsFor` and `interpolatePositions`.
 *
 * Two of those are worth saying goodbye to by name, because their reasons did not
 * disappear, they were **answered better**:
 *
 * - `alignToLongestAxis` rotated the settled cloud so its long direction ran along the
 *   canvas's, buying a measured 33.5% width fill out of an otherwise arbitrary one. The
 *   live simulation's gravity is aspect-aware instead, so the cloud is *grown* into the
 *   box rather than turned inside it — measured 67.8% width and 91.6% height on the
 *   owner's own folder shape, with no rotation and no distortion.
 * - `interpolatePositions` carried the dots from a seed ring to positions that had
 *   already been computed. The arrival a person sees now is the simulation actually
 *   converging, which is the same picture with the physics told the truth about.
 *
 * `graphology` and `graphology-layout-forceatlas2` are no longer imported here. They stay
 * in the repository for the map's own force pass; this canvas adds and removes no
 * dependency either way.
 */

export interface LayoutPoint {
  x: number;
  y: number;
}

/** World radius of the seed spiral. Arbitrary but fixed: everything is fitted to the box later. */
const SEED_RADIUS = 180;

/**
 * Where every node starts, before a single tick — **a golden-angle spiral, not a ring**.
 *
 * A plain circle puts every node the same distance from the centre, which gives the
 * force pass a symmetric start and, on a graph with one dominant hub, a symmetric and
 * therefore slow escape from it. The spiral breaks that symmetry deterministically and
 * starts the settle from something that already reads as a graph rather than as a dial.
 *
 * It is also the whole of the simulation's randomness budget: there is none. The same
 * folder seeds the same spiral, so it settles into the same picture on every machine and
 * every visit, which is what makes "the shape of my library" a thing a person can learn.
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
 * World → pixels, **one uniform scale for both axes**.
 *
 * Fitting x and y independently would fill the box exactly and lie about every distance
 * in it: a cluster would look tight vertically and loose horizontally on the same screen.
 * The distance between two dots is the only quantity this picture encodes, so it is the
 * one thing the fit may not distort. Filling the box is the *simulation's* job — its
 * gravity is shaped like the canvas — and this function's job is only to refuse to help.
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
 * takes, evaluated here because a canvas cannot hand a curve to CSS. The hover dim and
 * the fit travel both ride it.
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
