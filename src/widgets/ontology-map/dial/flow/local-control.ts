import type { Point } from "../types";

export function localRelationControl(a: Point, b: Point, control: Point): Point {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = Math.hypot(dx, dy);
  if (length < 1) return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const nx = -dy / length;
  const ny = dx / length;
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const bend = (control.x - mid.x) * nx + (control.y - mid.y) * ny;
  const limit = Math.min(48, length * 0.16);
  const bounded = Math.max(-limit, Math.min(limit, bend));
  return { x: mid.x + nx * bounded, y: mid.y + ny * bounded };
}
