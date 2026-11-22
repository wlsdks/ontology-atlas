import { polylineLength, subPolyline, type Pt } from '../../lib/film/film-geometry';

export function ribbonPath(pts: readonly Pt[], w0: number, from: number, to: number, wideAtStart: boolean): Path2D {
  const path = new Path2D();
  const part = subPolyline(pts, from, to);
  if (part.length < 2) return path;
  const total = polylineLength(pts) || 1;
  const left: Pt[] = [];
  const right: Pt[] = [];
  let run = from * total;
  for (let i = 0; i < part.length; i += 1) {
    const p = part[i]!;
    if (i > 0) run += Math.hypot(p.x - part[i - 1]!.x, p.y - part[i - 1]!.y);
    const a = part[Math.max(0, i - 1)]!;
    const b = part[Math.min(part.length - 1, i + 1)]!;
    const tl = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const share = run / total;
    const half = (w0 * (wideAtStart ? 1 - share : share)) / 2 + 0.25;
    left.push({ x: p.x - ((b.y - a.y) / tl) * half, y: p.y + ((b.x - a.x) / tl) * half });
    right.push({ x: p.x + ((b.y - a.y) / tl) * half, y: p.y - ((b.x - a.x) / tl) * half });
  }
  path.moveTo(left[0]!.x, left[0]!.y);
  for (const p of left) path.lineTo(p.x, p.y);
  for (let i = right.length - 1; i >= 0; i -= 1) path.lineTo(right[i]!.x, right[i]!.y);
  path.closePath();
  return path;
}
