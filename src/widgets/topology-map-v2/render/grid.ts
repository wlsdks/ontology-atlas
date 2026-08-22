/**
 * ⚠️ Colour-gate exemption (the `ALLOWLIST` in `scripts/check-no-raw-color.mjs`,
 * 2026-08-04). The vignette's `rgba(3,3,4,…)` is a string consumed by
 * `CanvasGradient.addColorStop()`, which cannot resolve `var(--…)`, and its alpha
 * is recomputed every frame from camera depth (`farT`). It looks black but is
 * not exactly r=g=b, so it misses the automatic greyscale exemption too. Do not
 * add new colours here — if one is unavoidable, record why alongside it.
 *
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

/**
 * The canvas background set. `dot` is the blueprint grid (the static default);
 * the rest are the cursor-reactive particle background
 * (`render/animated-background.ts`). Two older static tiles (constellation and
 * contour) were retired by owner decision on 2026-07-29.
 */
export type CanvasBackgroundVariant = "dot" | "web" | "depth";

/**
 * The three depth-dot layers — parallax factor, dot spacing (px), dot radius,
 * alpha multiplier (design council 2026-07-29).
 *
 * All eleven rejected background candidates were made of lines or closed shapes,
 * i.e. the **same grammar** as nodes and edges, so they read as more data rather
 * than as background. Dots survived because they do not pretend to be data — so
 * this third background **introduces no new primitive**, it just stacks the
 * already-approved dot in three layers.
 *
 * **All motion comes from the user's hand.** Each layer has a different parallax
 * factor, so they separate **only while the camera moves** and freeze completely
 * when it stops. Zero autonomous motion makes idle burn structurally impossible
 * — satisfying the workbench seat's 2026-07-28 P0 through **form** rather than
 * wiring, and staying inside WCAG 2.2 §2.3.3's user-initiated exception.
 *
 * No factor exceeds 1: above 1 the background would move faster than the content
 * and read as the nearer layer, which is the opposite of depth.
 */
export const DEPTH_DOT_LAYERS = [
  { parallax: 0.55, spacing: 132, radius: 0.9, alphaScale: 0.55 },
  { parallax: 0.78, spacing: 84, radius: 1.1, alphaScale: 0.8 },
  { parallax: 1, spacing: 52, radius: 1.3, alphaScale: 1 },
] as const;

/**
 * Tile pattern for one depth layer — a square tile holding one dot, repeated.
 * Static, so it is built once at mount/resize, the same way the blueprint grid is.
 */
export function buildDepthDotPattern(
  offscreenCanvas: HTMLCanvasElement,
  layer: { spacing: number; radius: number },
  color: string,
): CanvasPattern | null {
  const size = layer.spacing;
  offscreenCanvas.width = size;
  offscreenCanvas.height = size;
  const ctx = offscreenCanvas.getContext("2d");
  if (!ctx) return null;
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, layer.radius, 0, Math.PI * 2);
  ctx.fill();
  return ctx.createPattern(offscreenCanvas, "repeat");
}

export interface BackgroundDrawState {
  viewportWidth: number;
  viewportHeight: number;
  farT: number;
  /** Which background to draw; defaults to the dot (blueprint grid). */
  variant?: CanvasBackgroundVariant;
  gridPattern: CanvasPattern | null;
  /**
   * The three depth-dot layer patterns, each with its parallax already applied to
   * its origin. Consumed only when `variant === "depth"`.
   */
  depthLayers?: readonly { pattern: CanvasPattern | null; originX: number; originY: number; spacing: number }[];
  /**
   * Callback compositing the animated background's buffer for this frame; called
   * only for non-dot variants.
   *
   * A callback rather than a pattern because the particle background is an
   * afterimage accumulated in **its own offscreen buffer**, which `createPattern`
   * cannot express — and its parallax comes from shifting that buffer by the
   * camera delta, not from repeating a tile.
   */
  paintAnimated?: ((ctx: CanvasRenderingContext2D, width: number, height: number) => void) | null;
  /**
   * Screen position of the world origin, so the blueprint grid is anchored to
   * the WORLD instead of the display.
   *
   * AUDIT FINDING this fixes (Guardian 2026-07-20 B3): `draw()` took no camera
   * at all and laid the pattern down with `fillRect(0,0,w,h)`. Panning slid
   * the nodes across a grid welded to the monitor — zero parallax, so the map
   * read as marks sliding on glass rather than a camera moving over terrain.
   */
  originX: number;
  originY: number;
}

/** Major-line spacing of the tile built by `buildGridPattern` (24px minor × 5). */
export const GRID_TILE_PX = 120;

/** Positive modulo — `%` alone keeps the sign, which would jump the grid a whole tile when the origin goes negative. */
export function wrapToTile(offset: number, tile: number): number {
  if (tile <= 0) return 0;
  return ((offset % tile) + tile) % tile;
}

export interface BackgroundTokens {
  canvasBgNear: string;
  canvasBgFar: string;
  vignetteBaseAlpha: number;
  vignetteFarAlpha: number;
}

/** Draws the background fill, the selected background layer, and the vignette, in that order (bottom-most layer). */
/*
 * perf 2026-08-19 — two caches for frame-invariant results.
 *
 * The base colour string (`lerpColorHex`) and the vignette gradient are functions
 * of (colour tokens, farT, viewport) alone, yet were rebuilt every frame. When
 * the inputs match the previous frame the same value is reused — identical value,
 * identical pixels — and any input change (zoom, resize, theme) rebuilds
 * immediately in that frame.
 */
let bgBaseCacheKeyNear = "";
let bgBaseCacheKeyFar = "";
let bgBaseCacheFarT = -1;
let bgBaseCache = "";
let vignetteCacheW = -1;
let vignetteCacheH = -1;
let vignetteCacheAlpha = -1;
let vignetteCache: CanvasGradient | null = null;

export function draw(ctx: CanvasRenderingContext2D, state: BackgroundDrawState, tokens: BackgroundTokens): void {
  const { viewportWidth: w, viewportHeight: h, farT, gridPattern } = state;
  const variant = state.variant ?? "dot";

  if (bgBaseCacheKeyNear !== tokens.canvasBgNear || bgBaseCacheKeyFar !== tokens.canvasBgFar || bgBaseCacheFarT !== farT) {
    bgBaseCacheKeyNear = tokens.canvasBgNear;
    bgBaseCacheKeyFar = tokens.canvasBgFar;
    bgBaseCacheFarT = farT;
    bgBaseCache = lerpColorHex(tokens.canvasBgNear, tokens.canvasBgFar, farT);
  }
  const bgBase = bgBaseCache;
  ctx.fillStyle = bgBase;
  ctx.fillRect(0, 0, w, h);

  if (variant === "depth" && state.depthLayers) {
    // Each layer fills from its own parallax origin, so all three stop together
    // when the camera does.
    for (const layer of state.depthLayers) {
      if (!layer.pattern) continue;
      const ox = wrapToTile(layer.originX, layer.spacing);
      const oy = wrapToTile(layer.originY, layer.spacing);
      ctx.save();
      ctx.fillStyle = layer.pattern;
      ctx.translate(ox - layer.spacing, oy - layer.spacing);
      ctx.fillRect(0, 0, w + layer.spacing * 2, h + layer.spacing * 2);
      ctx.restore();
    }
  } else if (variant !== "dot" && state.paintAnimated) {
    // Animated background — the ink ceiling was already enforced while drawing the
    // buffer. No farT fade, for the same reason as the static constellation: its
    // ink is constant with altitude.
    state.paintAnimated(ctx, w, h);
  } else if (farT < 0.98) {
    // Dot (default) — the blueprint grid: visible only at circuit altitude, fading
    // out with farT.
    ctx.globalAlpha = 1 - farT;
    ctx.fillStyle = gridPattern ?? bgBase;
    const ox = wrapToTile(state.originX, GRID_TILE_PX);
    const oy = wrapToTile(state.originY, GRID_TILE_PX);
    ctx.save();
    ctx.translate(ox - GRID_TILE_PX, oy - GRID_TILE_PX);
    ctx.fillRect(0, 0, w + GRID_TILE_PX * 2, h + GRID_TILE_PX * 2);
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  // transparent-center gradient — an opaque full-canvas vignette would erase
  // the grid/star-dust layers just painted above (the prototype's own noted bug).
  const vignetteAlpha = computeVignetteAlpha(tokens.vignetteBaseAlpha, tokens.vignetteFarAlpha, farT);
  if (vignetteCache === null || vignetteCacheW !== w || vignetteCacheH !== h || vignetteCacheAlpha !== vignetteAlpha) {
    const vignette = ctx.createRadialGradient(
      w / 2,
      h / 2,
      Math.max(w, h) * 0.22,
      w / 2,
      h / 2,
      Math.max(w, h) * 0.72,
    );
    vignette.addColorStop(0, "rgba(3,3,4,0)");
    vignette.addColorStop(1, `rgba(3,3,4,${vignetteAlpha})`);
    vignetteCacheW = w;
    vignetteCacheH = h;
    vignetteCacheAlpha = vignetteAlpha;
    vignetteCache = vignette;
  }
  ctx.fillStyle = vignetteCache;
  ctx.fillRect(0, 0, w, h);
}
