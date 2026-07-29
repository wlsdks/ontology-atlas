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

/**
 * 캔버스 배경 세트. 도트=현 blueprint grid(정적 기본), 나머지 셋은 커서에 반응하는
 * 입자 배경(`render/animated-background.ts`). 구 정적 타일 2종(성좌·등고선)은
 * 2026-07-29 소유자 확정으로 폐기됐다.
 */
export type CanvasBackgroundVariant = "dot" | "web" | "depth";

/**
 * 깊이 도트의 세 층 — 시차 계수 · 점 간격(px) · 점 반지름 · 알파 배수.
 *
 * ## 왜 이 형태인가 (카운슬 2026-07-29)
 *
 * 기각된 후보 열한 개는 전부 선이거나 닫힌 도형이라 노드·관계선과 **같은
 * 문법**을 썼고, 그래서 배경이 아니라 "또 다른 데이터"로 읽혔다. 도트만
 * 살아남은 이유는 데이터인 척을 안 해서다. 그래서 세 번째 배경은 **새 원시형을
 * 들이지 않는다** — 이미 승인된 점을 세 층으로 둘 뿐이다.
 *
 * ## 움직임이 사용자 손에서만 나온다
 *
 * 층마다 시차 계수가 달라 **카메라가 움직일 때만** 서로 어긋나고, 카메라가
 * 서면 완전히 정지한다. 자율 운동이 0이라 유휴 연소가 구조적으로 불가능하다 —
 * 2026-07-28 「작업대」의 P0 를 배선이 아니라 **형태**로 만족시킨다. WCAG 2.2
 * §2.3.3 의 사용자-개시 예외 안이기도 하다.
 *
 * 계수가 1 을 넘지 않는 이유: 1 을 넘으면 배경이 내용보다 빨라 "가까운 층"으로
 * 읽히는데, 그건 깊이의 반대다.
 */
export const DEPTH_DOT_LAYERS = [
  { parallax: 0.55, spacing: 132, radius: 0.9, alphaScale: 0.55 },
  { parallax: 0.78, spacing: 84, radius: 1.1, alphaScale: 0.8 },
  { parallax: 1, spacing: 52, radius: 1.3, alphaScale: 1 },
] as const;

/**
 * 한 깊이 층의 타일 패턴 — 점 하나가 든 정사각 타일을 반복한다.
 * 정적이라 마운트/리사이즈 때 한 번만 만든다(blueprint grid 와 같은 문법).
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
  /** 어느 배경을 그릴지 — 생략 시 도트(blueprint grid). */
  variant?: CanvasBackgroundVariant;
  gridPattern: CanvasPattern | null;
  /**
   * 깊이 도트의 세 층 패턴 + 각 층의 이미 시차가 적용된 원점.
   * `variant === "depth"` 일 때만 소비한다.
   */
  depthLayers?: readonly { pattern: CanvasPattern | null; originX: number; originY: number; spacing: number }[];
  /**
   * 움직이는 배경의 이번 프레임 버퍼를 얹는 콜백(도트가 아닐 때만 호출).
   *
   * 패턴이 아니라 콜백인 이유: 입자 배경은 **자기 오프스크린 버퍼**에 누적된
   * 잔상이라 `createPattern` 으로 표현되지 않는다. 시차도 타일 반복이 아니라
   * 버퍼 자체를 카메라 델타만큼 옮겨서 만든다.
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
export function draw(ctx: CanvasRenderingContext2D, state: BackgroundDrawState, tokens: BackgroundTokens): void {
  const { viewportWidth: w, viewportHeight: h, farT, gridPattern } = state;
  const variant = state.variant ?? "dot";

  const bgBase = lerpColorHex(tokens.canvasBgNear, tokens.canvasBgFar, farT);
  ctx.fillStyle = bgBase;
  ctx.fillRect(0, 0, w, h);

  if (variant === "depth" && state.depthLayers) {
    // 층마다 자기 시차 원점으로 채운다 — 카메라가 서면 세 층이 함께 선다.
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
    // 움직이는 배경 — 잉크 상한은 버퍼를 그릴 때 이미 지켜졌다. farT 페이드를
    // 걸지 않는 것은 정적 성좌와 같은 이유다(고도와 무관한 상수 잉크).
    state.paintAnimated(ctx, w, h);
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
