import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LocalFsHandleRecord } from '@/entities/local-fs-handle';

/**
 * Desktop regression — reopening a recent vault failed silently.
 *
 * It catches two defects:
 *  1. A Tauri `invoke` rejects a `#[command]`'s `Err(String)` as **a string**, but the old catch read
 *     `err instanceof Error ? err.message : null`, so every desktop FS failure became null and was
 *     silenced behind a generic banner. The cause string must now survive as `errorMessage`.
 *  2. When the folder at a stored absolute path has moved or been deleted, a preflight classifies it
 *     as 'path-missing' and produces readable guidance, rather than blowing up as a raw io error
 *     inside load.
 */

const tauri = vi.hoisted(() => ({
  isTauriVaultRuntime: vi.fn(() => true),
  tauriVaultPathExists: vi.fn(async () => true),
  getTauriVaultRootPath: vi.fn(
    (h: { rootPath?: string }) => h?.rootPath,
  ),
  pickTauriVaultDirectory: vi.fn(),
}));

const store = vi.hoisted(() => ({
  getLocalFsHandle: vi.fn<() => Promise<LocalFsHandleRecord | undefined>>(
    async () => undefined,
  ),
  listRecentLocalFsHandles: vi.fn(async () => [] as LocalFsHandleRecord[]),
  putLocalFsHandle: vi.fn(async () => {}),
  touchLocalFsHandle: vi.fn(async () => {}),
  forgetRecentLocalFsHandle: vi.fn(async () => {}),
  deleteLocalFsHandle: vi.fn(async () => {}),
  verifyHandlePermission: vi.fn<() => Promise<PermissionState>>(
    async () => 'granted',
  ),
}));

const docsVault = vi.hoisted(() => ({
  buildLocalManifestWithEntries: vi.fn(),
  rebuildLocalManifestIncremental: vi.fn(),
  computeLocalVaultFingerprint: vi.fn(async () => 'fp'),
}));

vi.mock('@/shared/lib/tauri-vault-fs', () => tauri);

vi.mock('@/entities/local-fs-handle', () => ({
  CURRENT_LOCAL_FS_HANDLE_ID: 'current',
  ...store,
}));

vi.mock('@/entities/docs-vault', () => docsVault);

import { useLocalVaultInternal } from './use-local-vault';

function desktopRecord(): LocalFsHandleRecord {
  const rootPath = '/Users/dana/side-project/ontology-atlas/docs/ontology';
  return {
    id: 'current',
    handle: { kind: 'directory', name: 'ontology', rootPath } as unknown as FileSystemDirectoryHandle,
    desktopRootPath: rootPath,
    name: 'ontology',
    createdAt: 1,
    lastAccessedAt: 1,
  };
}

async function mountHook() {
  const hook = renderHook(() => useLocalVaultInternal());
  // Wait until the mount's IDB restore effect finishes and restoreAttempted turns true.
  await waitFor(() => expect(hook.result.current.restoreAttempted).toBe(true));
  return hook;
}

beforeEach(() => {
  tauri.isTauriVaultRuntime.mockReturnValue(true);
  tauri.tauriVaultPathExists.mockResolvedValue(true);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('useLocalVaultInternal — 데스크톱 최근 vault 재열기', () => {
  it('기존 vault 권한 대기 중 폴더 선택을 취소하면 이전 상태를 그대로 복원한다', async () => {
    store.getLocalFsHandle.mockResolvedValue(desktopRecord());
    store.verifyHandlePermission.mockResolvedValue('prompt');
    tauri.pickTauriVaultDirectory.mockResolvedValue(null);
    const hook = renderHook(() => useLocalVaultInternal());
    await waitFor(() => expect(hook.result.current.status).toBe('permission-needed'));

    await act(async () => {
      await hook.result.current.open();
    });

    expect(hook.result.current.status).toBe('permission-needed');
    expect(hook.result.current.errorMessage).toBeNull();
    expect(docsVault.buildLocalManifestWithEntries).not.toHaveBeenCalled();
  });

  it('저장된 폴더가 사라졌으면 path-missing 으로 분류하고 매니페스트 빌드를 아예 시도하지 않는다', async () => {
    tauri.tauriVaultPathExists.mockResolvedValue(false);
    const hook = await mountHook();

    await act(async () => {
      await hook.result.current.openRecent(desktopRecord());
    });

    expect(hook.result.current.status).toBe('error');
    expect(hook.result.current.errorCode).toBe('path-missing');
    // With the folder gone it never reaches load (the build) — no raw io error.
    expect(docsVault.buildLocalManifestWithEntries).not.toHaveBeenCalled();
    expect(store.putLocalFsHandle).not.toHaveBeenCalled();
  });

  it('폴더는 있으나 빌드가 문자열로 reject(=Tauri Err(String))하면 그 원인을 errorMessage 로 살린다', async () => {
    tauri.tauriVaultPathExists.mockResolvedValue(true);
    docsVault.buildLocalManifestWithEntries.mockRejectedValue(
      'No such file or directory (os error 2)',
    );
    const hook = await mountHook();

    await act(async () => {
      await hook.result.current.openRecent(desktopRecord());
    });

    expect(hook.result.current.status).toBe('error');
    // No silence: a string rejection is not lost to null but surfaced as-is.
    expect(hook.result.current.errorMessage).toBe(
      'No such file or directory (os error 2)',
    );
    expect(hook.result.current.errorCode).toBe('access-failed');
  });
});
