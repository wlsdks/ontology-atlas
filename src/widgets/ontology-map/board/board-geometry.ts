import type { HexTile } from "../model/hex-board";
import { hexFonts } from "../render/hex-board";
import type { HexBoardTokens } from "../tokens/read-hex-board-tokens";

export const COS = [0, 1, 2, 3, 4, 5].map((i) => Math.cos((i * Math.PI) / 3));
export const SIN = [0, 1, 2, 3, 4, 5].map((i) => Math.sin((i * Math.PI) / 3));
export const FRONT_SIDES = [0, 1, 2] as const;

interface Point {
  x: number;
  y: number;
}

export function face(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, c: number) {
  ctx.moveTo(x + r, y);
  for (let i = 1; i < 6; i += 1) ctx.lineTo(x + r * COS[i]!, y + r * SIN[i]! * c);
  ctx.closePath();
}

export function edges(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, c: number, from: number, count: number) {
  ctx.moveTo(x + r * COS[from % 6]!, y + r * SIN[from % 6]! * c);
  for (let k = 1; k <= count; k += 1) {
    const i = (from + k) % 6;
    ctx.lineTo(x + r * COS[i]!, y + r * SIN[i]! * c);
  }
}

export function side(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, c: number, k: number) {
  const b = (k + 1) % 6;
  ctx.moveTo(x + r * COS[k]!, y + r * SIN[k]! * c);
  ctx.lineTo(x + r * COS[b]!, y + r * SIN[b]! * c);
}

export function wall(ctx: CanvasRenderingContext2D, x: number, yTop: number, yBase: number, r: number, c: number, k: number) {
  const b = (k + 1) % 6;
  ctx.moveTo(x + r * COS[k]!, yTop + r * SIN[k]! * c);
  ctx.lineTo(x + r * COS[b]!, yTop + r * SIN[b]! * c);
  ctx.lineTo(x + r * COS[b]!, yBase + r * SIN[b]! * c);
  ctx.lineTo(x + r * COS[k]!, yBase + r * SIN[k]! * c);
  ctx.closePath();
}

export function smooth(ctx: CanvasRenderingContext2D, pts: readonly Point[], R: number) {
  ctx.beginPath();
  ctx.moveTo(pts[0]!.x, pts[0]!.y);
  for (let i = 1; i < pts.length - 1; i += 1) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    const n = pts[i + 1]!;
    const l1 = Math.hypot(b.x - a.x, b.y - a.y);
    const l2 = Math.hypot(n.x - b.x, n.y - b.y);
    if (l1 < 1e-6 || l2 < 1e-6) continue;
    const rr = Math.min(R * 0.3, l1 * 0.45, l2 * 0.45);
    ctx.lineTo(b.x - ((b.x - a.x) / l1) * rr, b.y - ((b.y - a.y) / l1) * rr);
    ctx.quadraticCurveTo(b.x, b.y, b.x + ((n.x - b.x) / l2) * rr, b.y + ((n.y - b.y) / l2) * rr);
  }
  const e = pts[pts.length - 1]!;
  ctx.lineTo(e.x, e.y);
}

export function notch(ctx: CanvasRenderingContext2D, tip: Point, centre: Point, R: number, RI: number, color: string, edge: string) {
  const len = Math.hypot(tip.x - centre.x, tip.y - centre.y) || 1;
  const ux = (tip.x - centre.x) / len;
  const uy = (tip.y - centre.y) / len;
  const t0 = (RI * Math.sqrt(3)) / 2 - 1.5;
  const base = (R * Math.sqrt(3)) / 2 + (R >= 28 ? 4 : 2);
  const hw = R >= 44 ? 5 : R >= 28 ? 3.5 : 2.2;
  ctx.beginPath();
  ctx.moveTo(centre.x + ux * t0, centre.y + uy * t0);
  ctx.lineTo(centre.x + ux * base - uy * hw, centre.y + uy * base + ux * hw);
  ctx.lineTo(centre.x + ux * base + uy * hw, centre.y + uy * base - ux * hw);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = edge;
  ctx.lineWidth = 1;
  ctx.lineJoin = "round";
  ctx.stroke();
}

export function stubHead(ctx: CanvasRenderingContext2D, tip: Point, centre: Point, R: number, color: string) {
  const dx = centre.x - tip.x;
  const dy = centre.y - tip.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const size = R >= 44 ? 9 : R >= 28 ? 7 : 5;
  ctx.beginPath();
  ctx.moveTo(tip.x - ux * size - uy * size * 0.6, tip.y - uy * size + ux * size * 0.6);
  ctx.lineTo(tip.x + ux * 2, tip.y + uy * 2);
  ctx.lineTo(tip.x - ux * size + uy * size * 0.6, tip.y - uy * size - ux * size * 0.6);
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.6;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.stroke();
}

export function startDot(ctx: CanvasRenderingContext2D, at: Point, r: number, color: string, edge: string) {
  ctx.beginPath();
  ctx.arc(at.x, at.y, r, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = edge;
  ctx.lineWidth = 1;
  ctx.stroke();
}

export function ticks(ctx: CanvasRenderingContext2D, x: number, y: number, RI: number, c: number, sides: readonly number[], color: string) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.4;
  ctx.lineCap = "round";
  ctx.beginPath();
  const rr = RI - 1.6;
  const half = Math.min(7, RI * 0.15);
  for (const k of sides) {
    const b = (k + 1) % 6;
    const cx = x + rr * ((COS[k]! + COS[b]!) / 2);
    const cy = y + rr * ((SIN[k]! + SIN[b]!) / 2) * c;
    const dx = COS[b]! - COS[k]!;
    const dy = (SIN[b]! - SIN[k]!) * c;
    const L = Math.hypot(dx, dy) || 1;
    ctx.moveTo(cx - (dx / L) * half, cy - (dy / L) * half);
    ctx.lineTo(cx + (dx / L) * half, cy + (dy / L) * half);
  }
  ctx.stroke();
}

export function pips(
  ctx: CanvasRenderingContext2D,
  t: HexTile,
  x: number,
  bottom: number,
  R: number,
  c: number,
  alpha: number,
  more: boolean,
  isStale: (id: string) => boolean,
  T: HexBoardTokens,
) {
  const n = t.elementCount;
  const show = n > 8 ? 7 : n;
  const pr = R >= 44 ? 2.7 : 2.2;
  const sp = pr * 2.7;
  const w = (show - 1) * sp + (n > 8 ? 14 : 0);
  const py = bottom - (pr + (R >= 44 ? 9 : 5)) * c;
  for (let k = 0; k < show; k += 1) {
    const stale = isStale(t.elementIds[k]!);
    ctx.fillStyle = stale ? T.stale : T.accent;
    ctx.globalAlpha = alpha * (stale ? 1 : 0.85);
    ctx.beginPath();
    face(ctx, x - w / 2 + k * sp, py, pr, 1);
    ctx.fill();
  }
  if (n > 8 && more) {
    ctx.globalAlpha = alpha;
    ctx.font = hexFonts().meta;
    ctx.fillStyle = T.inkMeta;
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(`+${n - show}`, x - w / 2 + show * sp - 2, py + 3.5);
  }
}
