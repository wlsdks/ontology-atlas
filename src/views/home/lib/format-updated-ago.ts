/**
 * Relative-time buckets for the node datasheet's "when did this change" line.
 *
 * In a product where an AI agent keeps updating the vault, a person cannot tell
 * changes apart without the time dimension on screen (owner, 2026-07-20).
 * Reduces a document's `updatedAt` (`file.lastModified` locally, build time for
 * the static manifest) to an i18n key plus a count; the caller's next-intl
 * assembles the string.
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
