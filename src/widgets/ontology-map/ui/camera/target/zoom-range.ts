/**
 * The camera's interactive zoom-in ceiling, viewport-relative: `overviewEntryScale x
 * maxZoomRatio`, constant in ratio terms so the tier-reveal bands can finish.
 * `--map-camera-scale-max` is only the fallback when `overviewEntryScale` is non-positive.
 */
export function computeEffectiveCameraScaleMax(
  overviewEntryScale: number,
  maxZoomRatio: number,
  absoluteFallback: number,
  contentScaleMax?: number,
): number {
  if (!(overviewEntryScale > 0)) return absoluteFallback;
  return Math.max(overviewEntryScale * maxZoomRatio, contentScaleMax ?? 0);
}

/**
 * The camera's interactive zoom-out floor, viewport-relative: `overviewEntryScale x minZoomRatio`
 * (`--map-camera-min-zoom-ratio`) replaces the absolute `--map-camera-scale-min` for the spring
 * and wheel clamps. The fit computations keep the absolute floor as their own sanity bound.
 */
export function computeEffectiveCameraScaleMin(
  overviewEntryScale: number,
  minZoomRatio: number,
  absoluteFallback: number,
): number {
  if (!(overviewEntryScale > 0)) return absoluteFallback;
  return overviewEntryScale * minZoomRatio;
}
