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

  it('delete 후 get 은 undefined', async () => {
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

  it('touch 는 lastAccessedAt 만 갱신', async () => {
    await putLocalFsHandle({
      id: CURRENT_LOCAL_FS_HANDLE_ID,
      handle: fakeHandle('A'),
      name: 'A',
      createdAt: 100,
      lastAccessedAt: 100,
    });
    const before = (await getLocalFsHandle())!;
    await new Promise((r) => setTimeout(r, 2));
    await touchLocalFsHandle();
    const after = (await getLocalFsHandle())!;
    expect(after.createdAt).toBe(before.createdAt);
    expect(after.lastAccessedAt).toBeGreaterThan(before.lastAccessedAt);
    expect((await listRecentLocalFsHandles())[0].lastAccessedAt).toBe(after.lastAccessedAt);
  });

  it('touch 는 record 가 없으면 no-op', async () => {
    await touchLocalFsHandle();
    expect(await getLocalFsHandle()).toBeUndefined();
  });

  it('legacy 키 자동 마이그레이션', async () => {
    memory.set('docs-vault:current-handle', fakeHandle('OldVault'));
    const restored = await getLocalFsHandle();
    expect(restored?.name).toBe('OldVault');
    expect(restored?.id).toBe(CURRENT_LOCAL_FS_HANDLE_ID);
    // legacy 키는 삭제됨
    expect(memory.get('docs-vault:current-handle')).toBeUndefined();
    // 새 키는 살아있음
    expect(
      memory.get('docs-vault:fs-handle:current'),
    ).toBeDefined();
    expect((await listRecentLocalFsHandles()).map((record) => record.name)).toEqual([
      'OldVault',
    ]);
  });

  it('마이그레이션은 한 번만 — 이후 read 는 record 직접', async () => {
    memory.set('docs-vault:current-handle', fakeHandle('OldVault'));
    const first = await getLocalFsHandle();
    const second = await getLocalFsHandle();
    expect(first?.name).toBe(second?.name);
    expect(memory.get('docs-vault:current-handle')).toBeUndefined();
  });

  it('multi-id 분리 저장', async () => {
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

  it('최근 vault 목록은 lastAccessedAt 순서로 dedupe 하고 5개로 제한', async () => {
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

  it('최근 vault 항목을 identity 기준으로 제거한다', async () => {
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

  it('브라우저 런타임에서는 Tauri desktop path record 를 복원하지 않는다', async () => {
    await putLocalFsHandle({
      id: CURRENT_LOCAL_FS_HANDLE_ID,
      handle: fakeHandle('Desktop Vault'),
      desktopRootPath: '/Users/jinan/vaults/desktop',
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

  it('Tauri 런타임에서는 저장된 desktop path record 를 handle shim 으로 복원한다', async () => {
    tauriApiMock.runtimeAvailable = true;
    await putLocalFsHandle({
      id: CURRENT_LOCAL_FS_HANDLE_ID,
      handle: fakeHandle('Desktop Vault'),
      desktopRootPath: '/Users/jinan/vaults/desktop',
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
