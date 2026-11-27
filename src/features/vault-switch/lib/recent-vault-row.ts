import type { LocalFsHandleRecord } from '@/entities/local-fs-handle';

/** `unknown` is distinct from `ready`: claiming reachability because nothing said otherwise is the failure. */
export type RecentVaultReachability = 'ready' | 'missing' | 'unknown';

export function canOpenReachability(state: RecentVaultReachability): boolean {
  return state !== 'missing';
}

/** Null `counts` renders "not counted yet", never `0 documents`. */
export interface RecentVaultRow {
  record: LocalFsHandleRecord;
  key: string;
  name: string;
  path: string | null;
  counts: { docCount: number; conceptCount: number; countedAt: number } | null;
  lastAccessedAt: number;
  reachability: RecentVaultReachability;
  isCurrent: boolean;
}

export function recentVaultRowKey(record: LocalFsHandleRecord): string {
  // The store's identity rule (`recordIdentity` in `entities/local-fs-handle/api/store.ts`),
  // recomputed to keep this module pure; a divergence only warns about a React key.
  return record.desktopRootPath ?? record.id;
}

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
