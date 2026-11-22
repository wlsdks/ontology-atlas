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
  listTauriDirectoryNames: vi.fn<(rootPath: string) => Promise<string[]>>(
    async () => [],
  ),
  createTauriVaultHandle: vi.fn((rootPath: string) => ({
    kind: 'directory' as const,
    name: rootPath.split('/').pop() ?? rootPath,
    rootPath,
  })),
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

vi.mock('@/shared/lib/vault-folder/native-vault/tauri-vault-files', () => tauri);
vi.mock('@/shared/lib/vault-folder/native-vault/tauri-vault-handle', () => tauri);
vi.mock('@/shared/lib/vault-folder/native-vault/tauri-vault-location', () => tauri);
vi.mock('@/shared/lib/vault-folder/native-vault/tauri-vault-runtime', () => tauri);

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

function projectRootRecord(): LocalFsHandleRecord {
  const rootPath = '/Users/dana/work/project';
  return {
    id: 'current',
    handle: { kind: 'directory', name: 'project', rootPath } as unknown as FileSystemDirectoryHandle,
    desktopRootPath: rootPath,
    name: 'project',
    createdAt: 1,
    lastAccessedAt: 1,
  };
}

function successfulBuild() {
  return {
    build: {
      manifest: {
        version: '1',
        generatedAt: '',
        docs: [],
        backlinksDetail: {},
        tags: {},
        tree: { name: 'root', path: '', type: 'dir' as const },
      },
      fileHandles: new Map(),
      imageHandles: new Map(),
      fingerprint: 'fp-atlas',
    },
    entries: [],
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
  tauri.listTauriDirectoryNames.mockResolvedValue([]);
  store.getLocalFsHandle.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('useLocalVaultInternal: reopening a recent vault on desktop', () => {
  it('builds only the one atlas child with Markdown even when a recent project root is opened', async () => {
    tauri.listTauriDirectoryNames.mockImplementation(async (rootPath: string) =>
      rootPath.endsWith('/atlas') ? ['project.md'] : [],
    );
    docsVault.buildLocalManifestWithEntries.mockResolvedValue(successfulBuild());
    const hook = await mountHook();

    await act(async () => {
      await hook.result.current.openRecent(projectRootRecord());
    });

    expect(hook.result.current.status).toBe('loaded');
    expect(docsVault.buildLocalManifestWithEntries).toHaveBeenCalledWith(
      expect.objectContaining({ rootPath: '/Users/dana/work/project/atlas' }),
      expect.objectContaining({ onPartial: expect.any(Function) }),
    );
    expect(store.putLocalFsHandle).toHaveBeenCalledWith(
      expect.objectContaining({
        desktopRootPath: '/Users/dana/work/project/atlas',
        name: 'atlas',
      }),
    );
    expect(hook.result.current.openedInsidePickedFolder).toBe('/Users/dana/work/project');
  });

  it('corrects an older project-root record to its atlas child on app start restore and builds only that', async () => {
    store.getLocalFsHandle.mockResolvedValue(projectRootRecord());
    tauri.listTauriDirectoryNames.mockImplementation(async (rootPath: string) =>
      rootPath.endsWith('/atlas') ? ['project.md'] : [],
    );
    docsVault.buildLocalManifestWithEntries.mockResolvedValue(successfulBuild());

    const hook = renderHook(() => useLocalVaultInternal());

    await waitFor(() => expect(hook.result.current.status).toBe('loaded'));
    expect(docsVault.buildLocalManifestWithEntries).toHaveBeenCalledWith(
      expect.objectContaining({ rootPath: '/Users/dana/work/project/atlas' }),
      expect.objectContaining({ onPartial: expect.any(Function) }),
    );
    expect(store.putLocalFsHandle).toHaveBeenCalledWith(
      expect.objectContaining({ desktopRootPath: '/Users/dana/work/project/atlas' }),
    );
    expect(hook.result.current.openedInsidePickedFolder).toBe('/Users/dana/work/project');
  });

  it('restores the previous state when folder selection is cancelled while the existing vault awaits permission', async () => {
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

  it('classifies a vanished saved folder as path-missing and never attempts a manifest build', async () => {
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

  it('a present-but-ungranted vault after the access-scope update is grant-needed, not path-missing', async () => {
    // The desktop refuses a real folder the user has not re-granted with this code; the
    // folder is there, so the person must re-confirm access, not be told it is gone.
    tauri.tauriVaultPathExists.mockRejectedValue('vault-root-not-granted');
    const hook = await mountHook();

    await act(async () => {
      await hook.result.current.openRecent(desktopRecord());
    });

    expect(hook.result.current.status).toBe('error');
    expect(hook.result.current.errorCode).toBe('grant-needed');
    expect(docsVault.buildLocalManifestWithEntries).not.toHaveBeenCalled();
  });

  it('keeps the cause as errorMessage when the folder exists but the build rejects with a string (Tauri Err(String))', async () => {
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

  it('never traps the first screen whatever fails during restore: a folder that exists but cannot be read', async () => {
    store.getLocalFsHandle.mockResolvedValue(desktopRecord());
    store.verifyHandlePermission.mockRejectedValue(
      new Error('Operation not permitted (os error 1)'),
    );

    const hook = renderHook(() => useLocalVaultInternal());

    await waitFor(() =>
      expect(
        hook.result.current.restoreAttempted,
        'restore failed yet the first screen keeps waiting',
      ).toBe(true),
    );
    expect(hook.result.current.status).toBe('error');
    expect(hook.result.current.errorCode).toBe('permission-denied');
    expect(hook.result.current.errorMessage).toBe('Operation not permitted (os error 1)');
  });

  it('still says a folder that vanished rather than being blocked has vanished', async () => {
    // The narrowing must not swallow its neighbour: sending somebody to System Settings to fix a
    // folder that is simply gone is a wrong instruction, and they will follow it and find nothing.
    store.getLocalFsHandle.mockResolvedValue(desktopRecord());
    store.verifyHandlePermission.mockRejectedValue(
      new Error('No such file or directory (os error 2)'),
    );

    const hook = renderHook(() => useLocalVaultInternal());

    await waitFor(() => expect(hook.result.current.restoreAttempted).toBe(true));
    expect(hook.result.current.errorCode).not.toBe('permission-denied');
  });
});
