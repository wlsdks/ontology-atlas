import type { RoundPassEntry } from '@/entities/library-round';

/**
 * Runs newest first by when they ended. The ledger is in append order, which is not run order
 * once a catch-up or a merged file lands an older run late. O(n log n).
 */
export function runsNewestFirst(entries: readonly RoundPassEntry[]): RoundPassEntry[] {
  return entries
    .map((entry, index) => ({ entry, index, endedMs: Date.parse(entry.endedAt) || 0 }))
    .sort((a, b) => b.endedMs - a.endedMs || b.index - a.index)
    .map(({ entry }) => entry);
}
