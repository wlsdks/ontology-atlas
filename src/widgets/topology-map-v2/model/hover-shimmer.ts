/**
 * **Pure phase model for the hover circuit-trace shimmer** (Design Guardian
 * prescription L). One bright arc travels slowly around the static hover ring
 * (1px, r+3) via `ctx.setLineDash` / `ctx.lineDashOffset` — zero glow, zero
 * shadow; the render-side contract is that it reuses the same
 * `strokeKindOutline` shape path.
 *
 * This module knows only **time → phase**. The perimeter is geometry that varies
 * hex/square/circle by kind and farT, so the caller (`render/node-shapes.ts`)
 * computes it from the `bodyPoints` / `FULL_CIRCLE_FAR_T` branch it already has
 * and passes it in. Here it is pure arithmetic with no canvas or DOM knowledge,
 * and vitest pins determinism, clamping, and constant-speed cycling. The
 * reduced-motion check is the caller's responsibility — no extra branch here.
 */

/** Clamp the segment ratio to [0,1], so token drift (negative or above 1) stays safe. */
export function clampSegRatio(segRatio: number): number {
  if (segRatio < 0) return 0;
  if (segRatio > 1) return 1;
  return segRatio;
}

export interface ShimmerDash {
  /** `ctx.setLineDash` argument — [segment length, remaining gap length]. */
  dash: readonly [number, number];
  /** `ctx.lineDashOffset`. */
  offset: number;
}

/**
 * Shimmer dash/offset at `now` (ms) — linear, constant-speed cycling, one lap per
 * `periodMs`, a single clockwise arc (the path `strokeKindOutline` draws already
 * increases in angle, i.e. clockwise, so the offset only advances that way).
 * When `perimeter` or `periodMs` is ≤ 0 — geometry not resolved yet, or token
 * drift — there is nothing to draw, so it returns dash `[0,0]` / offset 0 and the
 * caller can skip the stroke on `dash[0] <= 0`.
 */
export function computeHoverShimmer(
  now: number,
  periodMs: number,
  perimeter: number,
  segRatio: number,
): ShimmerDash {
  if (perimeter <= 0 || periodMs <= 0) {
    return { dash: [0, 0], offset: 0 };
  }
  const seg = clampSegRatio(segRatio);
  const segLen = perimeter * seg;
  const gapLen = perimeter - segLen;
  // Even for a negative `now` (defensive; not expected), phase stays in [0,1).
  const phase = (((now % periodMs) + periodMs) % periodMs) / periodMs;
  const offset = -phase * perimeter;
  return { dash: [segLen, gapLen], offset };
}
