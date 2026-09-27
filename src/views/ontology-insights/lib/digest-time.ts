/**
 * How long ago an agent did something, in as few characters as the row can spare; the time anchors the sentence
 * beside it, and the exact instant stays in the `title`.
 */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export interface DigestTimeLabels {
  /** Under a minute. */
  readonly justNow: string;
  readonly minutes: (value: number) => string;
  readonly hours: (value: number) => string;
  readonly days: (value: number) => string;
}

/** Returns null for an unusable stamp, so the caller draws nothing: a wrong time on an audit row is worse than none. */
export function formatDigestTime(
  iso: string,
  labels: DigestTimeLabels,
  now: number = Date.now(),
): string | null {
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return null;
  const elapsed = now - at;
  // A future stamp is a clock disagreement: say "just now", never a negative time.
  if (elapsed < MINUTE) return labels.justNow;
  if (elapsed < HOUR) return labels.minutes(Math.floor(elapsed / MINUTE));
  if (elapsed < DAY) return labels.hours(Math.floor(elapsed / HOUR));
  return labels.days(Math.floor(elapsed / DAY));
}
