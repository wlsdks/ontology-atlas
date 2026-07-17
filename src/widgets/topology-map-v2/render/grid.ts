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
 * Zero React imports. No extractable pure-geometry helper here (the pattern
 * tile is itself a small canvas built once at resize time, and the
 * background/vignette math is a straightforward token-driven formula, not a
 * geometric invariant worth a dedicated unit test) — left undecided per
 * `grid.test.ts` below.
 *
 * STUB: the lead implements both bodies.
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
export function buildGridPattern(
  _offscreenCanvas: HTMLCanvasElement,
  _input: GridPatternBuildInput,
): CanvasPattern | null {
  throw new Error(
    "TODO(lead): implement buildGridPattern per the prototype's buildGrid() — see docs/TOPOLOGY-V2-DESIGN.md §2.2.",
  );
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
export function draw(
  _ctx: CanvasRenderingContext2D,
  _state: BackgroundDrawState,
  _tokens: BackgroundTokens,
): void {
  throw new Error(
    "TODO(lead): implement draw() per the prototype's render() background section — see docs/TOPOLOGY-V2-DESIGN.md §2.2/§3.1.",
  );
}
