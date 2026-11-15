import type { NeuralFrame } from "./neural-frame";

/** The canvas-2D strokes and glow stamps every Neural axon pass draws with, reading a `NeuralFrame`'s axons. */

/** A tapered axon is stroked in this many pieces, each a sub-curve of the same quadratic. */
export const AXON_BANDS = 4;
const SPRITE_PX = 64;

const sprites = new Map<string, HTMLCanvasElement | null>();

/** A soft radial light of one ink, rasterised once and stamped scaled. */
export function glowSprite(ink: string): HTMLCanvasElement | null {
  if (sprites.has(ink)) return sprites.get(ink)!;
  const canvas = typeof document === "undefined" ? null : document.createElement("canvas");
  const g = canvas?.getContext("2d") ?? null;
  if (canvas && g) {
    canvas.width = canvas.height = SPRITE_PX;
    const half = SPRITE_PX / 2;
    const gradient = g.createRadialGradient(half, half, 0, half, half, half);
    gradient.addColorStop(0, ink);
    gradient.addColorStop(1, "transparent");
    g.fillStyle = gradient;
    g.fillRect(0, 0, SPRITE_PX, SPRITE_PX);
  }
  sprites.set(ink, canvas && g ? canvas : null);
  return sprites.get(ink)!;
}

export function stamp(ctx: CanvasRenderingContext2D, sprite: HTMLCanvasElement | null, x: number, y: number, r: number, alpha: number): void {
  if (sprite === null || alpha <= 0.004 || r <= 0.5) return;
  ctx.globalAlpha = alpha;
  ctx.drawImage(sprite, x - r, y - r, r * 2, r * 2);
}

export const at = (p0: number, p1: number, p2: number, t: number) => (1 - t) * (1 - t) * p0 + 2 * (1 - t) * t * p1 + t * t * p2;
/** The control of the sub-curve on [t0, t1]: the quadratic's blossom at (t0, t1). */
const subControl = (p0: number, p1: number, p2: number, t0: number, t1: number) =>
  (1 - t0) * (1 - t1) * p0 + ((1 - t0) * t1 + t0 * (1 - t1)) * p1 + t0 * t1 * p2;

/** Adds axon `i`'s sub-curve on [t0, t1] to the current path. */
export function traceAxon(ctx: CanvasRenderingContext2D, f: NeuralFrame, i: number, t0: number, t1: number): void {
  const { axonAX: ax, axonAY: ay, axonCX: acx, axonCY: acy, axonBX: abx, axonBY: aby } = f;
  ctx.moveTo(at(ax[i], acx[i], abx[i], t0), at(ay[i], acy[i], aby[i], t0));
  ctx.quadraticCurveTo(subControl(ax[i], acx[i], abx[i], t0, t1), subControl(ay[i], acy[i], aby[i], t0, t1),
    at(ax[i], acx[i], abx[i], t1), at(ay[i], acy[i], aby[i], t1));
}

export const bandWidthPx = (band: number, startPx: number, endPx: number) =>
  startPx + (endPx - startPx) * Math.sqrt((band + 0.5) / AXON_BANDS);

export function taperedAxon(ctx: CanvasRenderingContext2D, f: NeuralFrame, i: number, startPx: number, endPx: number): void {
  for (let band = 0; band < AXON_BANDS; band += 1) {
    ctx.lineWidth = bandWidthPx(band, startPx, endPx);
    ctx.beginPath();
    traceAxon(ctx, f, i, band / AXON_BANDS, (band + 1) / AXON_BANDS);
    ctx.stroke();
  }
}
