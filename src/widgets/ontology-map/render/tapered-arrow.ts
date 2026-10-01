export function arrowHead(ctx: CanvasRenderingContext2D, x: number, y: number, angle: number, size: number): void {
  const back = size * 0.9;
  const spread = size * 0.42;
  const bx = x - back * Math.cos(angle);
  const by = y - back * Math.sin(angle);
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(bx + spread * Math.sin(angle), by - spread * Math.cos(angle));
  ctx.quadraticCurveTo(bx + back * 0.18 * Math.cos(angle), by + back * 0.18 * Math.sin(angle), bx - spread * Math.sin(angle), by + spread * Math.cos(angle));
  ctx.closePath();
  ctx.fill();
}

export function taperedCurve(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  cx: number,
  cy: number,
  x2: number,
  y2: number,
  w0: number,
  w1: number,
): void {
  const steps = 28;
  const left: { x: number; y: number }[] = [];
  const right: { x: number; y: number }[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = (1 - t) ** 2 * x1 + 2 * (1 - t) * t * cx + t * t * x2;
    const y = (1 - t) ** 2 * y1 + 2 * (1 - t) * t * cy + t * t * y2;
    const dx = 2 * (1 - t) * (cx - x1) + 2 * t * (x2 - cx);
    const dy = 2 * (1 - t) * (cy - y1) + 2 * t * (y2 - cy);
    const len = Math.hypot(dx, dy) || 1;
    const half = (w0 + (w1 - w0) * t) / 2;
    left.push({ x: x - (dy / len) * half, y: y + (dx / len) * half });
    right.push({ x: x + (dy / len) * half, y: y - (dx / len) * half });
  }
  ctx.beginPath();
  left.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  for (let i = right.length - 1; i >= 0; i--) ctx.lineTo(right[i]!.x, right[i]!.y);
  ctx.closePath();
  ctx.fill();
}
