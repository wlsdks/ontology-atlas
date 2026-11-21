export interface Pt {
  x: number;
  y: number;
}

export interface Rect {
  l: number;
  t: number;
  r: number;
  b: number;
}

export const grow = (rect: Rect, by: number): Rect => ({ l: rect.l - by, t: rect.t - by, r: rect.r + by, b: rect.b + by });

export const overlaps = (a: Rect, b: Rect): boolean => a.l < b.r && a.r > b.l && a.t < b.b && a.b > b.t;

export const inside = (p: Pt, rect: Rect): boolean => p.x > rect.l && p.x < rect.r && p.y > rect.t && p.y < rect.b;


export function circleIntoRect(c: Pt, radius: number, rect: Rect): number {
  const nx = Math.max(rect.l, Math.min(c.x, rect.r));
  const ny = Math.max(rect.t, Math.min(c.y, rect.b));
  const d = Math.hypot(c.x - nx, c.y - ny);
  if (inside(c, rect)) return radius + Math.min(c.x - rect.l, rect.r - c.x, c.y - rect.t, rect.b - c.y);
  return Math.max(0, radius - d);
}

export function distanceToRect(p: Pt, rect: Rect): number {
  const dx = Math.max(rect.l - p.x, 0, p.x - rect.r);
  const dy = Math.max(rect.t - p.y, 0, p.y - rect.b);
  return Math.hypot(dx, dy);
}

export const dist = (a: Pt, b: Pt): number => Math.hypot(b.x - a.x, b.y - a.y);

export function quadAt(a: Pt, c: Pt, b: Pt, t: number): Pt {
  const u = 1 - t;
  return { x: u * u * a.x + 2 * u * t * c.x + t * t * b.x, y: u * u * a.y + 2 * u * t * c.y + t * t * b.y };
}

/**
 * The control point that bows the chord `a`-`b` by `bow` of its length to its left (a negative
 * bow bows right), so two values of opposite sign fall on opposite sides.
 */
export function bowControl(a: Pt, b: Pt, bow: number): Pt {
  return { x: (a.x + b.x) / 2 - (b.y - a.y) * bow, y: (a.y + b.y) / 2 + (b.x - a.x) * bow };
}

export function bowedPoints(a: Pt, b: Pt, bow: number, n = 40): Pt[] {
  const c = bowControl(a, b, bow);
  return Array.from({ length: n + 1 }, (_, i) => quadAt(a, c, b, i / n));
}

export function trim(pts: readonly Pt[], start: Pt, fromStart: number, end: Pt, fromEnd: number): Pt[] {
  return pts.filter((p) => dist(p, start) >= fromStart && dist(p, end) >= fromEnd);
}

export function polylineLength(pts: readonly Pt[]): number {
  let len = 0;
  for (let i = 1; i < pts.length; i += 1) len += dist(pts[i - 1]!, pts[i]!);
  return len;
}

export function resample(pts: readonly Pt[], step: number): Pt[] {
  if (pts.length === 0) return [];
  const out: Pt[] = [pts[0]!];
  let carry = 0;
  for (let i = 1; i < pts.length; i += 1) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    const len = dist(a, b);
    let d = step - carry;
    while (d <= len) {
      out.push({ x: a.x + ((b.x - a.x) * d) / len, y: a.y + ((b.y - a.y) * d) / len });
      d += step;
    }
    carry = len - (d - step);
  }
  out.push(pts[pts.length - 1]!);
  return out;
}

function segmentsCross(a: Pt, b: Pt, c: Pt, d: Pt): boolean {
  const o = (p: Pt, q: Pt, r: Pt) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const d1 = o(c, d, a);
  const d2 = o(c, d, b);
  const d3 = o(a, b, c);
  const d4 = o(a, b, d);
  return d1 * d2 < 0 && d3 * d4 < 0;
}

export function crossings(p: readonly Pt[], q: readonly Pt[]): number {
  let count = 0;
  for (let i = 1; i < p.length; i += 1) {
    for (let j = 1; j < q.length; j += 1) if (segmentsCross(p[i - 1]!, p[i]!, q[j - 1]!, q[j]!)) count += 1;
  }
  return count;
}

export function subPolyline(pts: readonly Pt[], from: number, to: number): Pt[] {
  if (pts.length < 2 || to <= from) return [];
  const total = polylineLength(pts);
  const a = from * total;
  const b = to * total;
  const out: Pt[] = [];
  let run = 0;
  for (let i = 1; i < pts.length; i += 1) {
    const p = pts[i - 1]!;
    const q = pts[i]!;
    const len = dist(p, q);
    const s0 = run;
    const s1 = run + len;
    if (s1 >= a && s0 <= b) {
      const t0 = len > 0 ? Math.max(0, (a - s0) / len) : 0;
      const t1 = len > 0 ? Math.min(1, (b - s0) / len) : 1;
      if (out.length === 0) out.push({ x: p.x + (q.x - p.x) * t0, y: p.y + (q.y - p.y) * t0 });
      out.push({ x: p.x + (q.x - p.x) * t1, y: p.y + (q.y - p.y) * t1 });
    }
    run = s1;
  }
  return out;
}

export function pointAlong(pts: readonly Pt[], t: number): Pt {
  if (pts.length === 0) return { x: 0, y: 0 };
  if (t <= 0 || pts.length === 1) return pts[0]!;
  const part = subPolyline(pts, 0, Math.min(1, t));
  return part[part.length - 1] ?? pts[pts.length - 1]!;
}

export const DEG = Math.PI / 180;

export const normalizeAngle = (angle: number): number => ((angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);

export const angleGap = (a: number, b: number): number => {
  const turn = normalizeAngle(a - b);
  return Math.min(turn, Math.PI * 2 - turn);
};
