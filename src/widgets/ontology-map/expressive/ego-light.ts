/**
 * Ego light: the node bloom (a blurred indigo disc under the focused or hovered node) and the
 * edge glow (a canvas shadow around ego lines). Every piece takes a `ramp` (0..1), painting nothing
 * at 0. Screen coordinates in, canvas calls out; no world, camera or React knowledge.
 */

export interface EgoLightTokens {
  indigo: string;
  indigoBright: string;
  /** `--map-ego-glow-blur-px` */
  egoGlowBlurPx: number;
  /** `--map-ego-glow-alpha` */
  egoGlowAlpha: number;
  /** `--map-node-bloom-blur-px` */
  nodeBloomBlurPx: number;
  /** `--map-node-bloom-alpha` */
  nodeBloomAlpha: number;
}

/** `#rrggbb` (or `#rgb`) → `rgba(r,g,b,a)`, which a `CanvasGradient` stop can take where a `var()` cannot. */
export function hexWithAlpha(hex: string, alpha: number): string {
  const h = hex.length === 4 ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}` : hex;
  const r = parseInt(h.slice(1, 3), 16);
  const g = parseInt(h.slice(3, 5), 16);
  const b = parseInt(h.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${Math.min(1, Math.max(0, alpha)).toFixed(3)})`;
}

export interface ScreenDisc {
  x: number;
  y: number;
  r: number;
}

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

/**
 * The bloom under one node; restores `shadowBlur` and `globalAlpha`. `ink` overrides the
 * indigo pair so a walked path lights its nodes as a star.
 */
export function drawNodeBloom(
  ctx: CanvasRenderingContext2D,
  disc: ScreenDisc,
  ramp: number,
  tokens: Pick<EgoLightTokens, "indigo" | "indigoBright" | "nodeBloomBlurPx" | "nodeBloomAlpha">,
  ink?: { core: string; halo: string },
): void {
  const k = clamp01(ramp);
  if (k <= 0.001) return;
  const previousAlpha = ctx.globalAlpha;
  ctx.shadowColor = hexWithAlpha(ink?.halo ?? tokens.indigoBright, 0.9 * k);
  ctx.shadowBlur = tokens.nodeBloomBlurPx * k;
  ctx.fillStyle = hexWithAlpha(ink?.core ?? tokens.indigo, tokens.nodeBloomAlpha * k);
  ctx.beginPath();
  ctx.arc(disc.x, disc.y, disc.r * 1.05, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.globalAlpha = previousAlpha;
}

/**
 * Edge glow: set the canvas shadow for the strokes that follow. Returns true when
 * it did, so the caller pairs it with `endEdgeGlow`. Nothing is set at ramp 0.
 */
export function beginEdgeGlow(
  ctx: CanvasRenderingContext2D,
  ramp: number,
  tokens: Pick<EgoLightTokens, "indigo" | "egoGlowBlurPx" | "egoGlowAlpha">,
  /** Overrides the ego indigo — the walked path glows in star ink. */
  ink?: string,
): boolean {
  const k = clamp01(ramp);
  if (k <= 0.001) return false;
  ctx.shadowColor = hexWithAlpha(ink ?? tokens.indigo, tokens.egoGlowAlpha * k);
  ctx.shadowBlur = tokens.egoGlowBlurPx * k;
  return true;
}

export function endEdgeGlow(ctx: CanvasRenderingContext2D): void {
  ctx.shadowBlur = 0;
}
