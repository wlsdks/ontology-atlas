/**
 * Background + blueprint grid + vignette — ported from the B2+ prototype's
 * `buildGrid()`/`render()` background section
 * (`docs/prototypes/topology-b2plus.html` §8, §13).
 *
 * Three layered atmospheric effects, all driven by the single `farT` value
 * (no discrete branch, `docs/TOPOLOGY-V2-DESIGN.md` §3.1):
 * - background: `lerpColor(canvasBgNear, canvasBgFar, farT)` fill.
 * - blueprint grid: a tiled 24px-minor/120px-major pattern
 *   (`--topology-v2-grid-minor`/`-grid-major`), circuit-only —
 *   `globalAlpha = 1 - farT`, fully gone by farT≈0.98.
 * - vignette: radial gradient, transparent center → dark edges,
 *   `alpha = --topology-v2-vignette-base-alpha + farT * --topology-v2-vignette-far-alpha`
 *   (0.32 base, +0.18 at full far-field). Must stay a *transparent-center*
 *   gradient — the prototype's own source comment flags an earlier bug where
 *   an opaque full-canvas vignette erased the grid/dust layers underneath it.
 *
 * The grid pattern itself is built once (offscreen tile → `createPattern`),
 * not per-frame — `draw()` receives an already-built `CanvasPattern` rather
 * than rebuilding it every call.
 *
 * Two pieces of the background math ARE plain formula evaluation, not canvas
 * side effects, so they're extracted and unit-tested in `grid.test.ts`:
 * `lerpColorHex` (the background near→far crossfade) and
 * `computeVignetteAlpha`. The pattern tile itself still needs a real canvas
 * 2D context (`test.todo` — jsdom doesn't implement one meaningfully).
 */

export interface GridPatternBuildInput {
  /** `--topology-v2-grid-minor`. */
  minorColor: string;
  /** `--topology-v2-grid-major`. */
  majorColor: string;
  /** Base fill under the grid lines — same as `--topology-v2-canvas-bg-near`. */
  baseColor: string;
}

/**
 * Builds the tiled blueprint-grid pattern once (24px minor spacing, 5 cells
 * per major line = 120px tile, prototype `buildGrid()`). Called on mount and
 * on resize — not per animation frame.
 */
const GRID_MINOR_SPACING = 24;
const GRID_CELLS_PER_MAJOR = 5;

export function buildGridPattern(
  offscreenCanvas: HTMLCanvasElement,
  input: GridPatternBuildInput,
): CanvasPattern | null {
  const size = GRID_MINOR_SPACING * GRID_CELLS_PER_MAJOR;
  offscreenCanvas.width = size;
  offscreenCanvas.height = size;
  const tileCtx = offscreenCanvas.getContext("2d");
  if (!tileCtx) return null;

  tileCtx.fillStyle = input.baseColor;
  tileCtx.fillRect(0, 0, size, size);

  tileCtx.strokeStyle = input.minorColor;
  tileCtx.lineWidth = 1;
  for (let x = GRID_MINOR_SPACING; x < size; x += GRID_MINOR_SPACING) {
    tileCtx.beginPath();
    tileCtx.moveTo(x + 0.5, 0);
    tileCtx.lineTo(x + 0.5, size);
    tileCtx.stroke();
  }
  for (let y = GRID_MINOR_SPACING; y < size; y += GRID_MINOR_SPACING) {
    tileCtx.beginPath();
    tileCtx.moveTo(0, y + 0.5);
    tileCtx.lineTo(size, y + 0.5);
    tileCtx.stroke();
  }

  // the tile's own top/left edge becomes the "major" line once tiled/repeated
  tileCtx.strokeStyle = input.majorColor;
  tileCtx.beginPath();
  tileCtx.moveTo(0.5, 0);
  tileCtx.lineTo(0.5, size);
  tileCtx.stroke();
  tileCtx.beginPath();
  tileCtx.moveTo(0, 0.5);
  tileCtx.lineTo(size, 0.5);
  tileCtx.stroke();

  return tileCtx.createPattern(offscreenCanvas, "repeat");
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const value = parseInt(hex.slice(1), 16);
  return { r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255 };
}

/** Linear RGB lerp between two `#rrggbb` hex colors — ported from the prototype's `lerpColor()`. */
export function lerpColorHex(hexA: string, hexB: string, t: number): string {
  const a = hexToRgb(hexA);
  const b = hexToRgb(hexB);
  const r = Math.round(a.r + (b.r - a.r) * t);
  const g = Math.round(a.g + (b.g - a.g) * t);
  const bl = Math.round(a.b + (b.b - a.b) * t);
  return `rgb(${r}, ${g}, ${bl})`;
}

/** `vignetteBaseAlpha + vignetteFarAlpha * farT` — the vignette's far-edge opacity at this altitude. */
export function computeVignetteAlpha(baseAlpha: number, farAlpha: number, farT: number): number {
  return baseAlpha + farAlpha * farT;
}

export interface BackgroundDrawState {
  viewportWidth: number;
  viewportHeight: number;
  farT: number;
  gridPattern: CanvasPattern | null;
}

export interface BackgroundTokens {
  canvasBgNear: string;
  canvasBgFar: string;
  vignetteBaseAlpha: number;
  vignetteFarAlpha: number;
}

/** Draws the background fill, grid-pattern fade, and vignette, in that order (bottom-most layer). */
export function draw(ctx: CanvasRenderingContext2D, state: BackgroundDrawState, tokens: BackgroundTokens): void {
  const { viewportWidth: w, viewportHeight: h, farT, gridPattern } = state;

  const bgBase = lerpColorHex(tokens.canvasBgNear, tokens.canvasBgFar, farT);
  ctx.fillStyle = bgBase;
  ctx.fillRect(0, 0, w, h);

  if (farT < 0.98) {
    ctx.globalAlpha = 1 - farT;
    ctx.fillStyle = gridPattern ?? bgBase;
    ctx.fillRect(0, 0, w, h);
    ctx.globalAlpha = 1;
  }

  // transparent-center gradient — an opaque full-canvas vignette would erase
  // the grid/star-dust layers just painted above (the prototype's own noted bug).
  const vignette = ctx.createRadialGradient(
    w / 2,
    h / 2,
    Math.max(w, h) * 0.22,
    w / 2,
    h / 2,
    Math.max(w, h) * 0.72,
  );
  vignette.addColorStop(0, "rgba(3,3,4,0)");
  vignette.addColorStop(1, `rgba(3,3,4,${computeVignetteAlpha(tokens.vignetteBaseAlpha, tokens.vignetteFarAlpha, farT)})`);
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, w, h);
}
