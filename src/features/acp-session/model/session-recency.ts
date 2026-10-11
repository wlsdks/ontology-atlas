import type { AcpSessionSummary } from './acp-client';

/**
 * Which past conversation is the latest. `session/list` order is the adapter's, so sort here
 * by readable `updatedAt`, newest first; rows without one keep adapter order below dated
 * ones, since unknown time is not old.
 */
function timeOf(session: AcpSessionSummary): number | null {
  if (!session.updatedAt) return null;
  const value = Date.parse(session.updatedAt);
  return Number.isFinite(value) ? value : null;
}

/**
 * Newest first, stable everywhere the answer is unknown.
 *
 * `Array.prototype.sort` is specified as stable, so two rows that compare equal — two
 * undated rows, or two rows stamped the same second — come out in the order the adapter
 * listed them.
 */
export function orderSessionsByRecency(
  sessions: readonly AcpSessionSummary[],
): AcpSessionSummary[] {
  return [...sessions].sort((left, right) => {
    const a = timeOf(left);
    const b = timeOf(right);
    if (a === null && b === null) return 0;
    if (a === null) return 1;
    if (b === null) return -1;
    return b - a;
  });
}

/**
 * The conversation reopening resumes, or `null` when this folder has none.
 *
 * With no date anywhere, this is the adapter's own first row rather than nothing. The
 * adapter is the only party that knows its list, and the head of the list is the same
 * conversation the person sees at the top of the history door — resuming that one keeps
 * those two answers identical, which is the whole point of ordering here.
 */
export function latestSession(
  sessions: readonly AcpSessionSummary[],
): AcpSessionSummary | null {
  return orderSessionsByRecency(sessions)[0] ?? null;
}
