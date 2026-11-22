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
 * and wheel clamps. The fit computations keep the absolute floor as their own sanity bound. The
 * Flat graph floors at its overview entry itself: its layout keeps every member off its domain's
 * name only down to that zoom, and past it the map only shrinks into empty canvas.
 */
export function computeEffectiveCameraScaleMin(
  overviewEntryScale: number,
  minZoomRatio: number,
  absoluteFallback: number,
  flatGraph = false,
): number {
  if (!(overviewEntryScale > 0)) return absoluteFallback;
  return overviewEntryScale * (flatGraph ? Math.max(1, minZoomRatio) : minZoomRatio);
}

/** Whether `world` draws the Flat graph, whose zoom-out floor is its overview entry. */
export function drawsFlatGraph(world: { dial?: { scene: { graph?: unknown } } | null } | null | undefined): boolean {
  return world?.dial?.scene.graph != null;
}
