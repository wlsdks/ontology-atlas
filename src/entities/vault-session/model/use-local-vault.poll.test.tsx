import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LocalFsHandleRecord } from '@/entities/local-fs-handle';

const tauri = vi.hoisted(() => ({
  isTauriVaultRuntime: vi.fn(() => true),
  tauriVaultPathExists: vi.fn(async () => true),
  listTauriDirectoryNames: vi.fn(async () => [] as string[]),
  createTauriVaultHandle: vi.fn(),
  getTauriVaultRootPath: vi.fn((h: { rootPath?: string }) => h?.rootPath),
  pickTauriVaultDirectory: vi.fn(),
  readTauriVaultTextTail: vi.fn(async () => ''),
}));

const store = vi.hoisted(() => ({
  getLocalFsHandle: vi.fn<() => Promise<LocalFsHandleRecord | undefined>>(async () => undefined),
  listRecentLocalFsHandles: vi.fn(async () => [] as LocalFsHandleRecord[]),
  putLocalFsHandle: vi.fn(async () => {}),
  touchLocalFsHandle: vi.fn(async () => {}),
  forgetRecentLocalFsHandle: vi.fn(async () => {}),
  deleteLocalFsHandle: vi.fn(async () => {}),
  verifyHandlePermission: vi.fn<() => Promise<PermissionState>>(async () => 'granted'),
}));

const docsVault = vi.hoisted(() => ({
  buildLocalManifestWithEntries: vi.fn(),
  rebuildLocalManifestIncremental: vi.fn(),
  computeLocalVaultFingerprintWithStamps: vi.fn(async () => ({ fingerprint: 'fp-vault', nativeStamps: null })),
}));

const poller = vi.hoisted(() => ({
  start: vi.fn(),
  stop: vi.fn(),
  createAdaptivePoller: vi.fn(),
}));

vi.mock('@/shared/lib/tauri-vault-fs', () => tauri);
vi.mock('@/entities/local-fs-handle', () => ({ CURRENT_LOCAL_FS_HANDLE_ID: 'current', ...store }));
vi.mock('@/entities/docs-vault', () => docsVault);
vi.mock('./poll-cadence', () => ({ createAdaptivePoller: poller.createAdaptivePoller }));

import { useLocalVaultInternal } from './use-local-vault';

function savedVault(rootPath?: string): LocalFsHandleRecord {
  return {
    id: 'current',
    handle: { kind: 'directory', name: 'vault', rootPath } as unknown as FileSystemDirectoryHandle,
    desktopRootPath: rootPath,
    name: 'vault',
    createdAt: 1,
    lastAccessedAt: 1,
  };
}

function builtVault() {
  return {
    build: {
      manifest: { version: '1', generatedAt: '', docs: [], backlinksDetail: {}, tags: {}, tree: { name: 'root', path: '', type: 'dir' as const } },
      fileHandles: new Map(),
      imageHandles: new Map(),
      fingerprint: 'fp-vault',
    },
    entries: [],
  };
}

beforeEach(() => {
  poller.createAdaptivePoller.mockReturnValue({ start: poller.start, stop: poller.stop });
  docsVault.buildLocalManifestWithEntries.mockResolvedValue(builtVault());
});

afterEach(() => {
  vi.clearAllMocks();
  Reflect.deleteProperty(window, 'showDirectoryPicker');
});

describe('keeping an open vault current', () => {
  it('starts no poller in the app, where the OS watcher reports every change', async () => {
    tauri.isTauriVaultRuntime.mockReturnValue(true);
    store.getLocalFsHandle.mockResolvedValue(savedVault('/Users/dana/vault'));

    const hook = renderHook(() => useLocalVaultInternal());

    await waitFor(() => expect(hook.result.current.status).toBe('loaded'));
    expect(poller.createAdaptivePoller).not.toHaveBeenCalled();
  });

  it('polls on the web, which has no folder watcher', async () => {
    tauri.isTauriVaultRuntime.mockReturnValue(false);
    Object.defineProperty(window, 'showDirectoryPicker', { value: vi.fn(), configurable: true });
    store.getLocalFsHandle.mockResolvedValue(savedVault());

    const hook = renderHook(() => useLocalVaultInternal());

    await waitFor(() => expect(hook.result.current.status).toBe('loaded'));
    expect(poller.createAdaptivePoller).toHaveBeenCalledTimes(1);
    expect(poller.start).toHaveBeenCalled();
  });

  it('reads only the tail of the activity log in the app', async () => {
    tauri.isTauriVaultRuntime.mockReturnValue(true);
    store.getLocalFsHandle.mockResolvedValue(savedVault('/Users/dana/vault'));
    tauri.readTauriVaultTextTail.mockResolvedValue(
      [1, 2].map((n) => JSON.stringify({ v: 1, at: `2026-09-27T00:0${n}:00Z`, summary: `entry ${n}` })).join('\n'),
    );

    const hook = renderHook(() => useLocalVaultInternal());

    await waitFor(() => expect(hook.result.current.agentActivityLog).toHaveLength(2));
    expect(tauri.readTauriVaultTextTail).toHaveBeenCalledWith('/Users/dana/vault', '.ontology-atlas/activity.jsonl', 50);
  });

  it('checks the folder when the app window regains focus', async () => {
    tauri.isTauriVaultRuntime.mockReturnValue(true);
    store.getLocalFsHandle.mockResolvedValue(savedVault('/Users/dana/vault'));
    const hook = renderHook(() => useLocalVaultInternal());
    await waitFor(() => expect(hook.result.current.status).toBe('loaded'));
    docsVault.computeLocalVaultFingerprintWithStamps.mockClear();

    act(() => {
      window.dispatchEvent(new Event('focus'));
    });

    await waitFor(() => expect(docsVault.computeLocalVaultFingerprintWithStamps).toHaveBeenCalledTimes(1));
    expect(docsVault.buildLocalManifestWithEntries).toHaveBeenCalledTimes(1);
  });
});
