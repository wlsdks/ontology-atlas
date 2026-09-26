import type { LocalFsHandleRecord } from '@/entities/local-fs-handle';

/**
 * Whether a stored folder can be opened **right now**, decided before the row is pressed.
 *
 * A stored handle is a claim about the past, and four things falsify it between two
 * launches: the folder is renamed or moved, its volume is unmounted, the browser's
 * permission is revoked, or the operating system refuses the read. A row that keeps its
 * ordinary look and then fails on press spends the person's one press to tell them
 * something it already knew — so the state is probed while the list is drawn and the row
 * says it.
 *
 * - `ready` — openable with no further ceremony.
 * - `needs-permission` — the handle is there, the browser will ask before reading. Not a
 *   failure: this is the ordinary web case, and pressing is exactly the gesture that fixes
 *   it. It is named rather than merged into `ready` so the row can warn that a prompt is
 *   coming instead of appearing to be a plain open.
 * - `missing` — the stored path no longer resolves. Not openable; the row offers to forget.
 * - `blocked` — permission was refused and the browser will not re-ask from this press.
 *   Not openable by pressing.
 * - `unknown` — the probe has not answered yet, or threw. Distinct from `ready` on purpose:
 *   claiming a folder is reachable because nothing has said otherwise is the failure this
 *   whole type exists to avoid.
 */
export type RecentVaultReachability =
  | 'ready'
  | 'needs-permission'
  | 'missing'
  | 'blocked'
  | 'unknown';

/** Whether pressing the row can lead to an opened folder. */
export function canOpenReachability(state: RecentVaultReachability): boolean {
  return state === 'ready' || state === 'needs-permission' || state === 'unknown';
}

/**
 * The facts one chooser row states, derived and never invented.
 *
 * `counts` is null for a folder whose last open predates the cached-count record shape.
 * A null is rendered as "not counted yet" — printing `0 documents` for an unknown number
 * would make an empty folder and an uncounted folder look identical, and one of those two
 * readings is false.
 */
export interface RecentVaultRow {
  record: LocalFsHandleRecord;
  /** Stable key: the absolute path when there is one, else the web identity. */
  key: string;
  name: string;
  /** Absolute path on desktop; null in a browser session, which has no path to show. */
  path: string | null;
  counts: { docCount: number; conceptCount: number; countedAt: number } | null;
  lastAccessedAt: number;
  reachability: RecentVaultReachability;
  /** Whether this row is the folder the last session had open. */
  isCurrent: boolean;
}

export function recentVaultRowKey(record: LocalFsHandleRecord): string {
  // The same identity rule the store dedupes on (`recordIdentity` in
  // `entities/local-fs-handle/api/store.ts`): the path when there is one, else the folder
  // name. Recomputing it rather than importing keeps this module pure, and a divergence
  // would only ever show up as a React key warning, never as a wrong folder.
  if (record.desktopRootPath) return record.desktopRootPath;
  const folderName = record.handle?.name;
  return folderName ? `fsa:${folderName}` : record.id;
}

/**
 * The rows a person can act on, and the folders that are gone, **in that order**.
 *
 * ⚠️ **Why the missing folders are split off** (owner inspection, 2026-09-26). Temporary folders
 * from QA runs are the most recently opened, so once they were deleted they sorted above the
 * folders that still exist: five dead rows, each with a warning and two buttons, stood between the
 * person and the folder they came for. A missing folder cannot be opened, so it is not an answer
 * to "which folder do you want to work in" — it is housekeeping. The list keeps every other row
 * where recency put it and gathers the missing ones into one line at its end.
 *
 * Only `missing` is gathered. `blocked` (a browser refusal) is a folder that is still there and
 * one press on the picker away, so it keeps its row; `unknown` stays pressable by design.
 */
export function partitionRecentVaultRows(rows: readonly RecentVaultRow[]): {
  listed: RecentVaultRow[];
  missing: RecentVaultRow[];
} {
  return {
    listed: rows.filter((row) => row.reachability !== 'missing'),
    missing: rows.filter((row) => row.reachability === 'missing'),
  };
}

export function buildRecentVaultRows({
  records,
  reachability,
  currentKey,
}: {
  records: ReadonlyArray<LocalFsHandleRecord>;
  reachability: Readonly<Record<string, RecentVaultReachability>>;
  currentKey: string | null;
}): RecentVaultRow[] {
  return records.map((record) => {
    const key = recentVaultRowKey(record);
    return {
      record,
      key,
      name: record.name || record.handle?.name || key,
      path: record.desktopRootPath ?? null,
      counts:
        typeof record.docCount === 'number' &&
        typeof record.conceptCount === 'number' &&
        typeof record.countedAt === 'number'
          ? {
              docCount: record.docCount,
              conceptCount: record.conceptCount,
              countedAt: record.countedAt,
            }
          : null,
      lastAccessedAt: record.lastAccessedAt,
      reachability: reachability[key] ?? 'unknown',
      isCurrent: currentKey !== null && key === currentKey,
    };
  });
}
