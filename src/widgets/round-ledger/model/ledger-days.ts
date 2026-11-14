import type { RoundPassEntry } from "@/entities/library-round";

export interface LedgerDay {
  /** Local midnight of the day, as a stable key. */
  key: string;
  date: Date;
  /** Newest first. */
  entries: RoundPassEntry[];
}

/** Newest day first, newest entry first within a day; a gap is placed on the day it ended. O(n log n). */
export function groupLedgerByDay(entries: readonly RoundPassEntry[]): LedgerDay[] {
  const byKey = new Map<string, LedgerDay>();
  const sorted = [...entries].sort((a, b) => new Date(b.endedAt).getTime() - new Date(a.endedAt).getTime());
  for (const entry of sorted) {
    const day = new Date(entry.endedAt);
    day.setHours(0, 0, 0, 0);
    const key = day.toISOString();
    let bucket = byKey.get(key);
    if (!bucket) {
      bucket = { key, date: day, entries: [] };
      byKey.set(key, bucket);
    }
    bucket.entries.push(entry);
  }
  return [...byKey.values()];
}

export function passDurationSeconds(entry: RoundPassEntry): number {
  const ms = new Date(entry.endedAt).getTime() - new Date(entry.startedAt).getTime();
  return Number.isFinite(ms) && ms > 0 ? Math.round(ms / 1000) : 0;
}
