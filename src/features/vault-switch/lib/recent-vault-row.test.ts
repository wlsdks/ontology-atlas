import { describe, expect, it } from 'vitest';
import type { LocalFsHandleRecord } from '@/entities/local-fs-handle';
import {
  buildRecentVaultRows,
  canOpenReachability,
  recentVaultRowKey,
} from './recent-vault-row';

function record(
  overrides: Partial<LocalFsHandleRecord> & { name: string },
): LocalFsHandleRecord {
  return {
    id: 'current',
    handle: {
      kind: 'directory',
      name: overrides.name,
    } as unknown as FileSystemDirectoryHandle,
    createdAt: 1,
    lastAccessedAt: 1,
    ...overrides,
  };
}

describe('recentVaultRowKey', () => {
  it('identifies a desktop folder by its absolute path', () => {
    expect(
      recentVaultRowKey(record({ name: 'atlas', desktopRootPath: '/Users/dana/atlas' })),
    ).toBe('/Users/dana/atlas');
  });

  it('falls back to the folder name in a browser session, not the record id', () => {
    // Every web record's id is 'current' (single-vault mode), so keying on the id collapsed
    // every folder to one identity - the bug the store's own `recordIdentity` comment
    // records. This mirror must agree with it or two folders share a React key.
    expect(recentVaultRowKey(record({ name: 'atlas' }))).toBe('fsa:atlas');
  });
});

describe('canOpenReachability', () => {
  it('allows a press that can still lead to an opened folder', () => {
    // `needs-permission` is pressable on purpose: the press is the gesture that grants
    // permission. `unknown` is pressable because refusing on an unanswered probe would
    // strand a folder that is probably fine.
    expect(canOpenReachability('ready')).toBe(true);
    expect(canOpenReachability('needs-permission')).toBe(true);
    expect(canOpenReachability('unknown')).toBe(true);
  });

  it('refuses a press that is already known to fail', () => {
    expect(canOpenReachability('missing')).toBe(false);
    expect(canOpenReachability('blocked')).toBe(false);
  });
});

describe('buildRecentVaultRows', () => {
  it('carries the stored counts and their age, so a row can say what is inside', () => {
    const rows = buildRecentVaultRows({
      records: [
        record({
          name: 'atlas',
          desktopRootPath: '/Users/dana/atlas',
          docCount: 232,
          conceptCount: 41,
          countedAt: 1_700_000_000_000,
          lastAccessedAt: 1_700_000_500_000,
        }),
      ],
      reachability: { '/Users/dana/atlas': 'ready' },
      currentKey: '/Users/dana/atlas',
    });

    expect(rows[0].counts).toEqual({
      docCount: 232,
      conceptCount: 41,
      countedAt: 1_700_000_000_000,
    });
    expect(rows[0].lastAccessedAt).toBe(1_700_000_500_000);
    expect(rows[0].isCurrent).toBe(true);
    expect(rows[0].path).toBe('/Users/dana/atlas');
  });

  it('reports absent counts as null rather than zero', () => {
    // A folder last opened before the counts were cached has an *unknown* content count.
    // Rendering that as `0 documents` would make it indistinguishable from an empty folder,
    // and one of those two readings is false.
    const rows = buildRecentVaultRows({
      records: [record({ name: 'legacy', desktopRootPath: '/Users/dana/legacy' })],
      reachability: {},
      currentKey: null,
    });

    expect(rows[0].counts).toBeNull();
  });

  it('treats a partially written count as no count', () => {
    // Two of the three fields is not an answer: without `countedAt` the row cannot say how
    // old the number is, and an unlabelled count reads as "this is what is in there now".
    const rows = buildRecentVaultRows({
      records: [
        record({ name: 'half', desktopRootPath: '/Users/dana/half', docCount: 12 }),
      ],
      reachability: {},
      currentKey: null,
    });

    expect(rows[0].counts).toBeNull();
  });

  it('defaults an unprobed folder to unknown, never to ready', () => {
    // The whole point of the reachability type: absence of bad news is not good news.
    const rows = buildRecentVaultRows({
      records: [record({ name: 'atlas', desktopRootPath: '/Users/dana/atlas' })],
      reachability: {},
      currentKey: null,
    });

    expect(rows[0].reachability).toBe('unknown');
  });

  it('marks only the folder the last session had open', () => {
    const rows = buildRecentVaultRows({
      records: [
        record({ name: 'atlas-old', desktopRootPath: '/Users/dana/atlas-old' }),
        record({ name: 'atlas', desktopRootPath: '/Users/dana/atlas' }),
      ],
      reachability: {},
      currentKey: '/Users/dana/atlas',
    });

    // Deliberately not the first row: the list is ordered by last access, and "was open
    // last" is a separate stored fact that stops agreeing with list order the moment a
    // touch or a failed open reorders it.
    expect(rows.map((row) => row.isCurrent)).toEqual([false, true]);
  });
});
