import { describe, expect, it } from 'vitest';
import type { LocalFsHandleRecord } from '@/entities/local-fs-handle';
import {
  buildRecentVaultRows,
  canOpenReachability,
  partitionRecentVaultRows,
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
    // Every web record's id is 'current', so the key must follow the store's `recordIdentity`.
    expect(recentVaultRowKey(record({ name: 'atlas' }))).toBe('fsa:atlas');
  });
});

describe('canOpenReachability', () => {
  it('allows a press that can still lead to an opened folder', () => {
    // Pressable: the press grants permission, and an unanswered probe must not strand a folder.
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
    // An unknown count must not render as `0 documents`.
    const rows = buildRecentVaultRows({
      records: [record({ name: 'legacy', desktopRootPath: '/Users/dana/legacy' })],
      reachability: {},
      currentKey: null,
    });

    expect(rows[0].counts).toBeNull();
  });

  it('treats a partially written count as no count', () => {
    // Without `countedAt` a count cannot say how old it is.
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

    // "Was open last" is a stored fact, independent of list order.
    expect(rows.map((row) => row.isCurrent)).toEqual([false, true]);
  });
});

describe('partitionRecentVaultRows', () => {
  it('keeps every folder that exists in recency order and gathers only the missing ones', () => {
    const rows = buildRecentVaultRows({
      records: [
        record({ name: 'qa-run-a', desktopRootPath: '/tmp/qa-run-a' }),
        record({ name: 'walled', desktopRootPath: '/Users/dana/walled' }),
        record({ name: 'qa-run-b', desktopRootPath: '/tmp/qa-run-b' }),
        record({ name: 'atlas', desktopRootPath: '/Users/dana/atlas' }),
        record({ name: 'unchecked', desktopRootPath: '/Volumes/net/unchecked' }),
      ],
      reachability: {
        '/tmp/qa-run-a': 'missing',
        '/Users/dana/walled': 'blocked',
        '/tmp/qa-run-b': 'missing',
        '/Users/dana/atlas': 'ready',
      },
      currentKey: null,
    });

    const { listed, missing } = partitionRecentVaultRows(rows);
    // Only a folder that is gone leaves the list.
    expect(listed.map((row) => row.name)).toEqual(['walled', 'atlas', 'unchecked']);
    expect(missing.map((row) => row.name)).toEqual(['qa-run-a', 'qa-run-b']);
  });
});
