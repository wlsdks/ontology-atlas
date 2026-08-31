/**
 * How long ago an agent did something, in as few characters as the row can spare.
 *
 * The activity log has carried `at` on every entry from the start and no screen
 * has ever drawn it, so a reader could see three changes and not know whether
 * they happened this morning or last month. That is the one fact a "what
 * happened" list cannot do without.
 *
 * It stays compact on purpose. The row's job is the sentence beside it; the time
 * is an anchor, not the content, and a full timestamp would take the width the
 * sentence needs. The exact instant is still available in the `title`.
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

/**
 * Returns null when the stamp is unusable, so the caller draws nothing rather
 * than an invented time. A wrong time on an audit row is worse than no time.
 */
export function formatDigestTime(
  iso: string,
  labels: DigestTimeLabels,
  now: number = Date.now(),
): string | null {
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return null;
  const elapsed = now - at;
  // A stamp from the future is a clock disagreement, not an event. Say "just
  // now" rather than "in -3 minutes", and never a negative number.
  if (elapsed < MINUTE) return labels.justNow;
  if (elapsed < HOUR) return labels.minutes(Math.floor(elapsed / MINUTE));
  if (elapsed < DAY) return labels.hours(Math.floor(elapsed / HOUR));
  return labels.days(Math.floor(elapsed / DAY));
}
