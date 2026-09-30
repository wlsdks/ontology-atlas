import { MOTION_EASE } from './tokens';

type Curve = readonly [number, number, number, number];

function axis(p1: number, p2: number, t: number): number {
  const u = 1 - t;
  return 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t;
}

function axisSlope(p1: number, p2: number, t: number): number {
  const u = 1 - t;
  return 3 * u * u * p1 + 6 * u * t * (p2 - p1) + 3 * t * t * (1 - p2);
}

export function cubicBezierAt(curve: Curve, x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const [x1, y1, x2, y2] = curve;
  let t = x;
  for (let i = 0; i < 8; i += 1) {
    const error = axis(x1, x2, t) - x;
    if (Math.abs(error) < 1e-7) return axis(y1, y2, t);
    const slope = axisSlope(x1, x2, t);
    if (Math.abs(slope) < 1e-6) break;
    t -= error / slope;
  }
  let lo = 0;
  let hi = 1;
  t = x;
  for (let i = 0; i < 40; i += 1) {
    const current = axis(x1, x2, t);
    if (Math.abs(current - x) < 1e-7) break;
    if (current < x) lo = t;
    else hi = t;
    t = (lo + hi) / 2;
  }
  return axis(y1, y2, t);
}

export function easeMotion(t: number): number {
  return cubicBezierAt(MOTION_EASE, t);
}
