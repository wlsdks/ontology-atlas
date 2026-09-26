/**
 * **The rail's arithmetic** — kept apart from the component so the travel is measured, not
 * assumed (spec `docs/specs/2026-09-21-round-cadence-and-scope.md` §2.2).
 *
 * A detent is a value the rail can say. They sit at even distances along the track whatever
 * their numbers are, because the hand reads distance, not ratio: putting 1440 minutes at
 * 1440/1 of the way along would leave every useful interval crushed into the first pixel.
 */

/** Under an hour, the intervals that divide it: `:00 :05 :10 …` stays a grid two rounds share. */
export const MINUTE_DETENTS: readonly number[] = [1, 5, 10, 15, 30];

/** An hour and over, in minutes. 1440 is a day — the same as daily, said as an interval. */
export const HOUR_DETENTS: readonly number[] = [60, 120, 180, 360, 720, 1440];

/** Where detent `index` sits along the track, 0 at the left end and 1 at the right. */
export function detentRatio(index: number, count: number): number {
  if (count <= 1) return 0;
  const clamped = Math.min(count - 1, Math.max(0, index));
  return clamped / (count - 1);
}

/**
 * The detent nearest a pointer at `x` pixels into a track `width` pixels wide.
 *
 * Out-of-track pointers clamp to the ends rather than wrapping: a drag that leaves the rail
 * and comes back must not have jumped to the other end while it was gone.
 */
export function nearestDetent(x: number, width: number, detents: readonly number[]): number {
  if (detents.length <= 1 || width <= 0) return 0;
  const ratio = Math.min(1, Math.max(0, x / width));
  return Math.round(ratio * (detents.length - 1));
}

/**
 * Where the thumb lands when the unit changes.
 *
 * `null` means the rail had no interval to carry over — the person was on Day — so the new
 * unit opens at its first detent. Otherwise the nearest detent **by value**, which is what
 * makes 30 minutes arrive at 1 hour and 1 hour arrive back at 30 minutes: those are the two
 * ends the two rails share, so the switch never throws the choice away.
 */
export function detentForMinutes(minutes: number | null, detents: readonly number[]): number {
  if (minutes === null || detents.length === 0) return 0;
  let best = 0;
  for (let index = 1; index < detents.length; index += 1) {
    if (Math.abs(detents[index] - minutes) < Math.abs(detents[best] - minutes)) best = index;
  }
  return best;
}

/** One detent left or right, or to an end, clamped. `Home`/`End` pass `-Infinity`/`Infinity`. */
export function stepDetent(index: number, delta: number, count: number): number {
  if (count <= 0) return 0;
  if (!Number.isFinite(delta)) return delta > 0 ? count - 1 : 0;
  return Math.min(count - 1, Math.max(0, index + delta));
}
