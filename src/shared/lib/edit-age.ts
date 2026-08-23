/**
 * Minute-granularity "ago" ladder for edit-provenance timestamps (agent
 * heartbeats and same-session self-edits both resolve to minutes or seconds).
 *
 * The day-granularity `computeUpdatedAgo` ladder used elsewhere for vault-doc
 * freshness (`views/home/lib/format-updated-ago.ts`) collapses every edit within
 * a day to 「Today」 (today) — fine for "when was this doc last touched at all",
 * too coarse for 「AI agent · 3 minutes ago」 (AI agent, 3 minutes ago). This ladder
 * covers minutes and hours, then falls back to the same day/week/month buckets so
 * long-idle facts still read naturally.
 */

export type EditAgeKey =
  | "justNow"
  | "minutesAgo"
  | "hoursAgo"
  | "yesterday"
  | "daysAgo"
  | "weeksAgo"
  | "monthsAgo";

export interface EditAge {
  key: EditAgeKey;
  count: number;
}

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

export function computeEditAge(atMs: number, nowMs: number): EditAge {
  const diffMs = Math.max(0, nowMs - atMs);
  const minutes = Math.floor(diffMs / MINUTE_MS);
  if (minutes < 1) return { key: "justNow", count: 0 };
  if (minutes < 60) return { key: "minutesAgo", count: minutes };
  const hours = Math.floor(diffMs / HOUR_MS);
  if (hours < 24) return { key: "hoursAgo", count: hours };
  const days = Math.floor(diffMs / DAY_MS);
  if (days === 1) return { key: "yesterday", count: 1 };
  if (days < 7) return { key: "daysAgo", count: days };
  if (days < 30) return { key: "weeksAgo", count: Math.floor(days / 7) };
  return { key: "monthsAgo", count: Math.floor(days / 30) };
}
