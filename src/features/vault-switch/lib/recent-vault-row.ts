import type { LocalFsHandleRecord } from '@/entities/local-fs-handle';

/**
 * Whether a stored folder can be opened now, probed before the row is pressed. `unknown` is
 * distinct from `ready`: claiming reachability because nothing said otherwise is the failure.
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

/** One row's facts; null `counts` renders "not counted yet", never `0 documents`. */
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
  // The store's identity rule (`recordIdentity` in `entities/local-fs-handle/api/store.ts`),
  // recomputed to keep this module pure; a divergence only warns about a React key.
  if (record.desktopRootPath) return record.desktopRootPath;
  const folderName = record.handle?.name;
  return folderName ? `fsa:${folderName}` : record.id;
}

/** Actionable rows in recency order, then the `missing` ones gathered for one line at the end. */
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
