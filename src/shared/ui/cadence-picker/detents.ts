/**
 * The rail's arithmetic (`docs/specs/2026-09-21-round-cadence-and-scope.md` §2.2). Detents sit
 * at even distances whatever their values, because the hand reads distance; proportional
 * spacing would crush the useful intervals into the first pixel.
 */

/** Under an hour, intervals that divide it, so rounds share a `:00 :05 :10` grid. */
export const MINUTE_DETENTS: readonly number[] = [1, 5, 10, 15, 30];

/** An hour and over, in minutes; 1440 is daily said as an interval. */
export const HOUR_DETENTS: readonly number[] = [60, 120, 180, 360, 720, 1440];

/** 0 at the left end and 1 at the right. */
export function detentRatio(index: number, count: number): number {
  if (count <= 1) return 0;
  const clamped = Math.min(count - 1, Math.max(0, index));
  return clamped / (count - 1);
}

/** Clamps an out-of-track pointer to the ends, so leaving the rail never jumps across. */
export function nearestDetent(x: number, width: number, detents: readonly number[]): number {
  if (detents.length <= 1 || width <= 0) return 0;
  const ratio = Math.min(1, Math.max(0, x / width));
  return Math.round(ratio * (detents.length - 1));
}

/**
 * Where the thumb lands on a unit change: the first detent when there is no interval (`null`,
 * on Day), otherwise the nearest by value, so 30 minutes and 1 hour carry across.
 */
export function detentForMinutes(minutes: number | null, detents: readonly number[]): number {
  if (minutes === null || detents.length === 0) return 0;
  let best = 0;
  for (let index = 1; index < detents.length; index += 1) {
    if (Math.abs(detents[index] - minutes) < Math.abs(detents[best] - minutes)) best = index;
  }
  return best;
}

/** Clamped; `Home`/`End` pass `-Infinity`/`Infinity`. */
export function stepDetent(index: number, delta: number, count: number): number {
  if (count <= 0) return 0;
  if (!Number.isFinite(delta)) return delta > 0 ? count - 1 : 0;
  return Math.min(count - 1, Math.max(0, index + delta));
}
