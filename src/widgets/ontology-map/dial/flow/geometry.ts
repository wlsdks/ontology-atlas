import type { Box, Point } from "../types";

export function quadAt(p0: Point, c: Point, p1: Point, t: number): Point {
  const u = 1 - t;
  return { x: u * u * p0.x + 2 * u * t * c.x + t * t * p1.x, y: u * u * p0.y + 2 * u * t * c.y + t * t * p1.y };
}

function quadPiece(p0: Point, c: Point, p1: Point, t0: number, t1: number): [Point, Point, Point] {
  return [
    quadAt(p0, c, p1, t0),
    {
      x: (1 - t0) * (1 - t1) * p0.x + ((1 - t0) * t1 + t0 * (1 - t1)) * c.x + t0 * t1 * p1.x,
      y: (1 - t0) * (1 - t1) * p0.y + ((1 - t0) * t1 + t0 * (1 - t1)) * c.y + t0 * t1 * p1.y,
    },
    quadAt(p0, c, p1, t1),
  ];
}

export function quadLength(p0: Point, c: Point, p1: Point): number {
  let len = 0;
  let prev = p0;
  for (let i = 1; i <= 16; i += 1) {
    const q = quadAt(p0, c, p1, i / 16);
    len += Math.hypot(q.x - prev.x, q.y - prev.y);
    prev = q;
  }
  return len;
}

export function trimmedPiece(p0: Point, c: Point, p1: Point, trimStart: number, trimEnd: number): [Point, Point, Point] | null {
  const length = quadLength(p0, c, p1);
  if (length < 1) return null;
  return quadPiece(p0, c, p1, Math.min(0.45, trimStart / length), Math.max(0.55, 1 - trimEnd / length));
}

export function overlaps(a: Box, b: Box): boolean {
  return a.minX < b.maxX && a.maxX > b.minX && a.minY < b.maxY && a.maxY > b.minY;
}

export function inside(box: Box, rect: Box): boolean {
  return box.minX >= rect.minX && box.maxX <= rect.maxX && box.minY >= rect.minY && box.maxY <= rect.maxY;
}
