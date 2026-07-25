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

/** 캔버스 배경 세트 (Phase 5 #20). 도트=현 blueprint grid(기본), 성좌/등고선은 대체 타일. */
export type CanvasBackgroundVariant = "dot" | "constellation" | "contour";

/** 성좌/등고선 타일의 반복 크기(px) — blueprint grid 와 같은 120px 배수라 같은 시차 격자. */
export const ALT_BG_TILE_PX = 240;

export interface BackgroundDrawState {
  viewportWidth: number;
  viewportHeight: number;
  farT: number;
  /** 어느 배경을 그릴지 — 생략 시 도트(blueprint grid). */
  variant?: CanvasBackgroundVariant;
  gridPattern: CanvasPattern | null;
  /** 성좌 배경 타일 패턴(variant==="constellation" 일 때만 소비). */
  constellationPattern?: CanvasPattern | null;
  /** 등고선 배경 타일 패턴(variant==="contour" 일 때만 소비). */
  contourPattern?: CanvasPattern | null;
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

/**
 * Fills the viewport with a camera-anchored repeating pattern, sliding the
 * tiling with the camera (mod one tile → constant cost) and overdrawing by a
 * tile on every side to cover the shifted seam. Shared by the blueprint grid
 * and the alternate (constellation/contour) backgrounds so all three ride the
 * same parallax格子.
 */
function fillPatternAnchored(
  ctx: CanvasRenderingContext2D,
  pattern: CanvasPattern,
  w: number,
  h: number,
  originX: number,
  originY: number,
  tile: number,
): void {
  const ox = wrapToTile(originX, tile);
  const oy = wrapToTile(originY, tile);
  ctx.save();
  ctx.fillStyle = pattern;
  ctx.translate(ox - tile, oy - tile);
  ctx.fillRect(0, 0, w + tile * 2, h + tile * 2);
  ctx.restore();
}

/** Draws the background fill, the selected background layer, and the vignette, in that order (bottom-most layer). */
export function draw(ctx: CanvasRenderingContext2D, state: BackgroundDrawState, tokens: BackgroundTokens): void {
  const { viewportWidth: w, viewportHeight: h, farT, gridPattern } = state;
  const variant = state.variant ?? "dot";

  const bgBase = lerpColorHex(tokens.canvasBgNear, tokens.canvasBgFar, farT);
  ctx.fillStyle = bgBase;
  ctx.fillRect(0, 0, w, h);

  if (variant === "constellation" && state.constellationPattern) {
    // 정적 성좌 — farT 페이드 없이 상수 잉크(토큰 알파에 이미 담김). 배경은
    // 언제나 데이터에 진다. blueprint grid 와 같은 카메라 시차.
    fillPatternAnchored(ctx, state.constellationPattern, w, h, state.originX, state.originY, ALT_BG_TILE_PX);
  } else if (variant === "contour" && state.contourPattern) {
    // 정적 등고선 — 저대비 곡선(atlas 정체성). 엣지로 읽히지 않게 토큰 알파가
    // 노드/엣지 잉크보다 훨씬 낮다. 상수 잉크, 카메라 시차.
    fillPatternAnchored(ctx, state.contourPattern, w, h, state.originX, state.originY, ALT_BG_TILE_PX);
  } else if (farT < 0.98) {
    // 도트(기본) — blueprint grid: circuit 고도에서만 보이고 farT 로 페이드아웃.
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
