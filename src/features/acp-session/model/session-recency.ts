import type { AcpSessionSummary } from './acp-client';

/** `session/list` order is the adapter's, so sort by readable `updatedAt`, newest first; rows without one keep adapter order below dated ones, since unknown time is not old. */
function timeOf(session: AcpSessionSummary): number | null {
  if (!session.updatedAt) return null;
  const value = Date.parse(session.updatedAt);
  return Number.isFinite(value) ? value : null;
}

/** Stable (`Array.prototype.sort` is): rows that compare equal come out in the order the adapter listed them. */
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

/** Null when this folder has none. With no date anywhere it is the adapter's first row, so reopening resumes the conversation at the top of the history door. */
export function latestSession(
  sessions: readonly AcpSessionSummary[],
): AcpSessionSummary | null {
  return orderSessionsByRecency(sessions)[0] ?? null;
}
