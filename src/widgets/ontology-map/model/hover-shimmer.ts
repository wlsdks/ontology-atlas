/**
 * Time to phase for the hover shimmer: one bright arc travels the hover ring
 * through `setLineDash`/`lineDashOffset`, with no glow. The caller (`render/node-shapes.ts`) passes
 * the perimeter, which varies by kind and farT, and owns the reduced-motion check.
 */

/** Token drift (negative or above 1) stays safe. */
export function clampSegRatio(segRatio: number): number {
  if (segRatio < 0) return 0;
  if (segRatio > 1) return 1;
  return segRatio;
}

export interface ShimmerDash {
  dash: readonly [number, number];
  offset: number;
}

/**
 * One clockwise lap per `periodMs`, matching the outline's increasing angle. Unresolved
 * geometry or token drift (≤ 0) returns dash `[0,0]` so the caller skips the stroke.
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
  const phase = (((now % periodMs) + periodMs) % periodMs) / periodMs;
  const offset = -phase * perimeter;
  return { dash: [segLen, gapLen], offset };
}
