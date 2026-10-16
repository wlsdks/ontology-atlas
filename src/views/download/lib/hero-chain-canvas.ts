import { HERO_CHAIN, type ChainFrame } from './hero-chain';

const TAU = Math.PI * 2;

export interface ChainPoint {
  x: number;
  y: number;
}

export function drawChainCanvas(
  ctx: CanvasRenderingContext2D,
  frame: Readonly<ChainFrame>,
  points: readonly [ChainPoint, ChainPoint, ChainPoint],
  radii: readonly [number, number, number],
  ink: string,
  alpha: number,
): void {
  const base = Math.min(1, alpha) * frame.alpha;
  ctx.save();
  ctx.strokeStyle = ink;
  ctx.fillStyle = ink;
  ctx.globalAlpha = base * 0.95;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  for (let i = 0; i < 2; i += 1) {
    const k = Math.max(0, Math.min(1, frame.inked - i));
    if (k <= 0) continue;
    const a = points[i]!;
    const b = points[i + 1]!;
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k);
  }
  ctx.stroke();
  ctx.lineWidth = 1.3;
  for (let i = 0; i < 3; i += 1) {
    const lit = frame.lit[i]!;
    if (lit <= 0) continue;
    const p = points[i]!;
    const r = radii[i]! * (1 + (HERO_CHAIN.swell - 1) * lit);
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, TAU);
    ctx.globalAlpha = base * 0.2 * lit;
    ctx.fill();
    ctx.globalAlpha = base * lit;
    ctx.stroke();
  }
  if (frame.pulseHop !== -1) {
    const a = points[frame.pulseHop]!;
    const b = points[frame.pulseHop + 1]!;
    const x = a.x + (b.x - a.x) * frame.pulseU;
    const y = a.y + (b.y - a.y) * frame.pulseU;
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, TAU);
    ctx.globalAlpha = base * 0.22;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x, y, 2.1, 0, TAU);
    ctx.globalAlpha = base;
    ctx.fill();
  }
  ctx.restore();
}
