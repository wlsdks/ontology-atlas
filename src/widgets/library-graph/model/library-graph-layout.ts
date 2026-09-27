import { MOTION_EASE } from "@/shared/motion";

/** The geometry the simulation is drawn through: seeds, the fit, and the easing curve. */

export interface LayoutPoint {
  x: number;
  y: number;
}

/** World radius of the seed spiral. Arbitrary but fixed: everything is fitted to the box later. */
const SEED_RADIUS = 180;

/**
 * Every node's start: a golden-angle spiral, not a ring, whose symmetry slows the escape
 * from a hub. Deterministic, so a folder settles the same on every machine and visit.
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

/** World → pixels with one uniform scale for both axes, since distance is what the picture encodes. */
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
  // A zero span on an axis would divide by zero; that axis takes scale 1 instead.
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
 * `--motion-ease` sampled for the canvas, from `MOTION_EASE`, never four literals
 * (src/shared/motion/tokens.ts is the gated copy). Newton's method converges in a few
 * steps on this monotone curve.
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
