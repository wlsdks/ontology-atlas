import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LocalFsHandleRecord } from '@/entities/local-fs-handle';

/**
 * P5 데스크톱 회귀 — 최근 vault 재열기 침묵 실패.
 *
 * 두 결함을 잡는다:
 *  1. Tauri invoke 는 `#[command]` 의 Err(String) 을 **문자열**로 reject 하는데
 *     이전 catch 는 `err instanceof Error ? err.message : null` 라 모든
 *     데스크톱 FS 실패가 null → generic 배너로 침묵했다. 이제 원인 문자열이
 *     errorMessage 로 살아야 한다.
 *  2. 저장된 절대 경로의 폴더가 이동/삭제된 경우, load 안에서 raw io 오류로
 *     터지기 전에 preflight 로 'path-missing' 를 분류해 사람이 읽을 수 있는
 *     안내를 낸다.
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
  // 마운트 시 IDB 복원 effect 가 끝나 restoreAttempted 가 true 가 될 때까지 대기.
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
    // 폴더가 없으니 load(빌드)까지 가지 않는다 — raw io 오류로 터지지 않음.
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
    // 침묵 금지: 문자열 reject 가 null 로 사라지지 않고 그대로 노출된다.
    expect(hook.result.current.errorMessage).toBe(
      'No such file or directory (os error 2)',
    );
    expect(hook.result.current.errorCode).toBe('access-failed');
  });
});
