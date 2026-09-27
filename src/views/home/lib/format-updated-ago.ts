/**
 * Relative-time bucket for the datasheet's "when did this change" line: an i18n key plus a count.
 * The date comes from `useVaultDocDates` (Git's last commit, else `file.lastModified`, else build
 * time).
 */

export interface UpdatedAgo {
  key: "today" | "yesterday" | "daysAgo" | "weeksAgo" | "monthsAgo";
  count: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function computeUpdatedAgo(updatedAtIso: string, nowMs: number): UpdatedAgo | null {
  const updatedMs = Date.parse(updatedAtIso);
  if (Number.isNaN(updatedMs)) return null;
  const days = Math.floor((nowMs - updatedMs) / DAY_MS);
  if (days < 0) return { key: "today", count: 0 };
  if (days === 0) return { key: "today", count: 0 };
  if (days === 1) return { key: "yesterday", count: 1 };
  if (days < 7) return { key: "daysAgo", count: days };
  if (days < 30) return { key: "weeksAgo", count: Math.floor(days / 7) };
  return { key: "monthsAgo", count: Math.floor(days / 30) };
}
