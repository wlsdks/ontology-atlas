/** A pointerdown commits to a drag only after moving more than `--map-hysteresis-px` (7 px); below that a pointerup is a click. */

export interface Point {
  x: number;
  y: number;
}

/** True once the pointer has moved further than `thresholdPx` (Euclidean) from `downPoint`. */
export function exceedsHysteresisThreshold(
  downPoint: Point,
  currentPoint: Point,
  thresholdPx: number,
): boolean {
  const dx = currentPoint.x - downPoint.x;
  const dy = currentPoint.y - downPoint.y;
  return Math.sqrt(dx * dx + dy * dy) > thresholdPx;
}
