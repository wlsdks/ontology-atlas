import { arrowHead, taperedCurve } from "../render/tapered-arrow";

export interface DomainFlowWidthParams {
  base: number;
  slope: number;
  max: number;
}

export interface FlowPoint {
  x: number;
  y: number;
}

export function domainFlowWidth(count: number, { base, slope, max }: DomainFlowWidthParams): number {
  return Math.min(max, base + slope * Math.log2(1 + Math.max(0, count)));
}

export function drawDomainFlow(
  ctx: CanvasRenderingContext2D,
  p1: FlowPoint,
  pc: FlowPoint,
  p2: FlowPoint,
  w0: number,
  twoWay: boolean,
  fill: string,
  headFill: string,
): void {
  const w1 = twoWay ? w0 : w0 * 0.45;
  ctx.fillStyle = fill;
  taperedCurve(ctx, p1.x, p1.y, pc.x, pc.y, p2.x, p2.y, w0, w1);
  ctx.fillStyle = headFill;
  arrowHead(ctx, p2.x, p2.y, Math.atan2(p2.y - pc.y, p2.x - pc.x), Math.max(3, 2.4 * w1));
  if (twoWay) arrowHead(ctx, p1.x, p1.y, Math.atan2(p1.y - pc.y, p1.x - pc.x), Math.max(3, 2.4 * w0));
}
