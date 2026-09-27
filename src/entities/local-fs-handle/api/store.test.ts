import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const memory = new Map<string, unknown>();
const tauriApiMock = vi.hoisted(() => ({
  runtimeAvailable: false,
  invoke: vi.fn(),
}));

vi.mock('@/shared/lib/idb-kv', () => ({
  idbGet: vi.fn(async (key: string) => memory.get(key)),
  idbSet: vi.fn(async (key: string, value: unknown) => {
    memory.set(key, value);
  }),
  idbDel: vi.fn(async (key: string) => {
    memory.delete(key);
  }),
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: tauriApiMock.invoke,
  isTauri: () => tauriApiMock.runtimeAvailable,
}));

import {
  CURRENT_LOCAL_FS_HANDLE_ID,
  deleteLocalFsHandle,
  forgetRecentLocalFsHandle,
  getLocalFsHandle,
  listRecentLocalFsHandles,
  putLocalFsHandle,
  recordLocalFsHandleContents,
  touchLocalFsHandle,
} from './store';
import type { LocalFsHandleRecord } from '../model/types';

function fakeHandle(name: string): FileSystemDirectoryHandle {
  return { kind: 'directory', name } as unknown as FileSystemDirectoryHandle;
}

beforeEach(() => {
  memory.clear();
  tauriApiMock.runtimeAvailable = false;
  tauriApiMock.invoke.mockReset();
});
afterEach(() => {
  memory.clear();
  tauriApiMock.runtimeAvailable = false;
  tauriApiMock.invoke.mockReset();
});

describe('local-fs-handle store', () => {
  it('put → get round-trip', async () => {
    const record: LocalFsHandleRecord = {
      id: CURRENT_LOCAL_FS_HANDLE_ID,
      handle: fakeHandle('Notes'),
      name: 'Notes',
      createdAt: 1000,
      lastAccessedAt: 1000,
    };
    await putLocalFsHandle(record);
    const restored = await getLocalFsHandle();
    expect(restored?.name).toBe('Notes');
    expect(restored?.handle.name).toBe('Notes');
  });

  it('returns undefined after delete', async () => {
    await putLocalFsHandle({
      id: CURRENT_LOCAL_FS_HANDLE_ID,
      handle: fakeHandle('Tmp'),
      name: 'Tmp',
      createdAt: 1,
      lastAccessedAt: 1,
    });
    await deleteLocalFsHandle();
    expect(await getLocalFsHandle()).toBeUndefined();
  });

  it('updates only lastAccessedAt on touch', async () => {
    await putLocalFsHandle({
      id: CURRENT_LOCAL_FS_HANDLE_ID,
      handle: fakeHandle('A'),
      name: 'A',
      createdAt: 100,
      lastAccessedAt: 100,
    });
    const before = (await getLocalFsHandle())!;
    /* Waits for the clock to move rather than sleeping, so a coarse clock cannot tie. */
    await vi.waitFor(() => {
      if (Date.now() === before.lastAccessedAt) throw new Error('clock has not advanced yet');
    });
    await touchLocalFsHandle();
    const after = (await getLocalFsHandle())!;
    expect(after.createdAt).toBe(before.createdAt);
    expect(after.lastAccessedAt).toBeGreaterThan(before.lastAccessedAt);
    expect((await listRecentLocalFsHandles())[0].lastAccessedAt).toBe(after.lastAccessedAt);
  });

  it('does nothing on touch without a record', async () => {
    await touchLocalFsHandle();
    expect(await getLocalFsHandle()).toBeUndefined();
  });

  it('migrates the legacy key', async () => {
    memory.set('docs-vault:current-handle', fakeHandle('OldVault'));
    const restored = await getLocalFsHandle();
    expect(restored?.name).toBe('OldVault');
    expect(restored?.id).toBe(CURRENT_LOCAL_FS_HANDLE_ID);
    expect(memory.get('docs-vault:current-handle')).toBeUndefined();
    expect(
      memory.get('docs-vault:fs-handle:current'),
    ).toBeDefined();
    expect((await listRecentLocalFsHandles()).map((record) => record.name)).toEqual([
      'OldVault',
    ]);
  });

  it('migrates once and reads the record afterwards', async () => {
    memory.set('docs-vault:current-handle', fakeHandle('OldVault'));
    const first = await getLocalFsHandle();
    const second = await getLocalFsHandle();
    expect(first?.name).toBe(second?.name);
    expect(memory.get('docs-vault:current-handle')).toBeUndefined();
  });

  it('stores several ids separately', async () => {
    await putLocalFsHandle({
      id: 'current',
      handle: fakeHandle('A'),
      name: 'A',
      createdAt: 1,
      lastAccessedAt: 1,
    });
    await putLocalFsHandle({
      id: 'archive',
      handle: fakeHandle('B'),
      name: 'B',
      createdAt: 2,
      lastAccessedAt: 2,
    });
    expect((await getLocalFsHandle('current'))?.name).toBe('A');
    expect((await getLocalFsHandle('archive'))?.name).toBe('B');
  });

  it('dedupes recent vaults by lastAccessedAt and keeps five', async () => {
    for (let i = 0; i < 6; i += 1) {
      await putLocalFsHandle({
        id: `vault-${i}`,
        handle: fakeHandle(`Vault ${i}`),
        name: `Vault ${i}`,
        createdAt: i,
        lastAccessedAt: i,
      });
    }
    await putLocalFsHandle({
      id: 'vault-2',
      handle: fakeHandle('Vault 2'),
      name: 'Vault 2',
      createdAt: 2,
      lastAccessedAt: 20,
    });

    expect((await listRecentLocalFsHandles()).map((record) => record.name)).toEqual([
      'Vault 2',
      'Vault 5',
      'Vault 4',
      'Vault 3',
      'Vault 1',
    ]);
  });

  it('removes a recent vault by identity', async () => {
    const first: LocalFsHandleRecord = {
      id: 'current',
      handle: fakeHandle('Current'),
      name: 'Current',
      createdAt: 1,
      lastAccessedAt: 1,
    };
    const second: LocalFsHandleRecord = {
      id: 'archive',
      handle: fakeHandle('Archive'),
      name: 'Archive',
      createdAt: 2,
      lastAccessedAt: 2,
    };

    await putLocalFsHandle(first);
    await putLocalFsHandle(second);
    await forgetRecentLocalFsHandle({
      ...first,
      handle: fakeHandle('Current'),
    });

    expect((await listRecentLocalFsHandles()).map((record) => record.name)).toEqual([
      'Archive',
    ]);
    expect((await getLocalFsHandle('current'))?.name).toBe('Current');
  });

  it('does not restore a desktop path record in the browser', async () => {
    await putLocalFsHandle({
      id: CURRENT_LOCAL_FS_HANDLE_ID,
      handle: fakeHandle('Desktop Vault'),
      desktopRootPath: '/Users/dana/vaults/desktop',
      name: 'Desktop Vault',
      createdAt: 1,
      lastAccessedAt: 1,
    });
    await putLocalFsHandle({
      id: 'browser',
      handle: fakeHandle('Browser Vault'),
      name: 'Browser Vault',
      createdAt: 2,
      lastAccessedAt: 2,
    });

    expect(await getLocalFsHandle()).toBeUndefined();
    expect((await listRecentLocalFsHandles()).map((record) => record.name)).toEqual([
      'Browser Vault',
    ]);
  });

  it('web FSA records with different folders both stay in the recent list', async () => {
    // Web records all share id 'current', so identity must come from the folder, not the id.
    await putLocalFsHandle({
      id: CURRENT_LOCAL_FS_HANDLE_ID,
      handle: fakeHandle('vault-a'),
      name: 'Vault A',
      createdAt: 1,
      lastAccessedAt: 1,
    });
    await putLocalFsHandle({
      id: CURRENT_LOCAL_FS_HANDLE_ID,
      handle: fakeHandle('vault-b'),
      name: 'Vault B',
      createdAt: 2,
      lastAccessedAt: 2,
    });
    // Re-opening the same folder updates its entry instead of adding a copy.
    await putLocalFsHandle({
      id: CURRENT_LOCAL_FS_HANDLE_ID,
      handle: fakeHandle('vault-a'),
      name: 'Vault A',
      createdAt: 1,
      lastAccessedAt: 3,
    });

    const recent = await listRecentLocalFsHandles();
    expect(recent.map((record) => record.name)).toEqual(['Vault A', 'Vault B']);
  });

  it('restores a desktop path record as a handle shim in Tauri', async () => {
    tauriApiMock.runtimeAvailable = true;
    await putLocalFsHandle({
      id: CURRENT_LOCAL_FS_HANDLE_ID,
      handle: fakeHandle('Desktop Vault'),
      desktopRootPath: '/Users/dana/vaults/desktop',
      name: 'Desktop Vault',
      createdAt: 1,
      lastAccessedAt: 1,
    });

    const restored = await getLocalFsHandle();
    const recent = await listRecentLocalFsHandles();

    expect(restored?.name).toBe('Desktop Vault');
    expect(restored?.handle.name).toBe('desktop');
    expect(recent.map((record) => record.name)).toEqual(['Desktop Vault']);
    expect(recent[0].handle.name).toBe('desktop');
  });
});

describe('recordLocalFsHandleContents', () => {
  it('writes the counts onto the current record and its recent entry', async () => {
      await putLocalFsHandle({
        id: CURRENT_LOCAL_FS_HANDLE_ID,
        handle: fakeHandle('atlas'),
        name: 'atlas',
        createdAt: 1,
        lastAccessedAt: 1,
      });

      await recordLocalFsHandleContents({ docCount: 232, conceptCount: 41 });

      // The chooser reads the recent list while settings read the `current` record.
      const current = await getLocalFsHandle();
      expect(current?.docCount).toBe(232);
      expect(current?.conceptCount).toBe(41);
      expect(current?.countedAt).toBeTypeOf('number');

    const recent = await listRecentLocalFsHandles();
    expect(recent[0].docCount).toBe(232);
    expect(recent[0].conceptCount).toBe(41);
  });

  it('does nothing when there is no such record', async () => {
      // A count for an unstored folder would invent a chooser entry nobody opened.
      await recordLocalFsHandleContents({ docCount: 5, conceptCount: 2 });

    expect(await getLocalFsHandle()).toBeUndefined();
    expect(await listRecentLocalFsHandles()).toEqual([]);
  });
});

describe('the recent list survives concurrent writers', () => {
  /* Two unawaited writes must both land: the entry count decides whether the chooser opens. */
  it('keeps both folders when two writes are started without awaiting the first', async () => {
    // Neither awaited, as the vault-load path calls them.
    const first = putLocalFsHandle({
      id: 'a',
      handle: fakeHandle('atlas'),
      name: 'atlas',
      createdAt: 1,
      lastAccessedAt: 1,
    });
    const second = putLocalFsHandle({
      id: 'b',
      handle: fakeHandle('atlas-old'),
      name: 'atlas-old',
      createdAt: 2,
      lastAccessedAt: 2,
    });
    await Promise.all([first, second]);

    const recent = await listRecentLocalFsHandles();
    expect(recent.map((r) => r.name).sort()).toEqual(['atlas', 'atlas-old']);
    expect(recent).toHaveLength(2);
  });

  /* No forget-race case: the in-memory mock cannot interleave, so it would pass with the queue off. */
});
