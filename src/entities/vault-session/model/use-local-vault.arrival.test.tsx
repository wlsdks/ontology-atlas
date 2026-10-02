import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LocalFsHandleRecord } from '@/entities/local-fs-handle';
import type { VaultBuildObserver } from '@/entities/docs-vault';

const tauri = vi.hoisted(() => ({
  isTauriVaultRuntime: vi.fn(() => true),
  tauriVaultPathExists: vi.fn(async () => true),
  listTauriDirectoryNames: vi.fn(async () => [] as string[]),
  createTauriVaultHandle: vi.fn((rootPath: string) => ({ kind: 'directory' as const, name: 'vault', rootPath })),
  getTauriVaultRootPath: vi.fn((h: { rootPath?: string }) => h?.rootPath),
  pickTauriVaultDirectory: vi.fn(),
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
  computeLocalVaultFingerprintWithStamps: vi.fn(async () => ({ fingerprint: 'changed', nativeStamps: null })),
}));

vi.mock('@/shared/lib/tauri-vault-fs', () => tauri);
vi.mock('@/entities/local-fs-handle', () => ({ CURRENT_LOCAL_FS_HANDLE_ID: 'current', ...store }));
vi.mock('@/entities/docs-vault', () => docsVault);

import { useLocalVaultInternal } from './use-local-vault';

function build(slugs: string[], fingerprint: string) {
  return {
    build: {
      manifest: {
        version: '1',
        generatedAt: '',
        docs: slugs.map((slug) => ({ slug, path: `${slug}.md`, title: slug, frontmatter: {} })),
        backlinksDetail: {},
        tags: {},
        tree: { name: 'vault', path: '', type: 'dir' as const },
      },
      fileHandles: new Map(),
      imageHandles: new Map(),
      sourceHandles: new Map(),
      fingerprint,
    },
    entries: [],
  };
}

const record: LocalFsHandleRecord = {
  id: 'current',
  handle: { kind: 'directory', name: 'vault', rootPath: '/Users/dana/vault' } as unknown as FileSystemDirectoryHandle,
  desktopRootPath: '/Users/dana/vault',
  name: 'vault',
  createdAt: 1,
  lastAccessedAt: 1,
};

beforeEach(() => {
  store.getLocalFsHandle.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('opening a folder whose documents arrive over time', () => {
  it('shows the read part beside an honest count, then exactly the finished folder', async () => {
    const partial = build(['atlas', 'domains/order'], 'partial');
    const full = build(['atlas', 'domains/order', 'capabilities/checkout'], 'full');
    let finish: () => void = () => undefined;
    docsVault.buildLocalManifestWithEntries.mockImplementation(
      async (_handle: FileSystemDirectoryHandle, observer?: VaultBuildObserver) => {
        observer?.onProgress?.({ read: 2, total: 3 });
        observer?.onPartial?.(partial.build as never, { read: 2, total: 3 });
        await new Promise<void>((resolve) => {
          finish = resolve;
        });
        return full;
      },
    );
    const hook = renderHook(() => useLocalVaultInternal());
    await waitFor(() => expect(hook.result.current.restoreAttempted).toBe(true));

    let opened: Promise<unknown> = Promise.resolve();
    act(() => {
      opened = hook.result.current.openRecent(record);
    });
    await waitFor(() => expect(hook.result.current.partialManifest).toBe(partial.build.manifest));
    expect(hook.result.current.status).toBe('loading');
    expect(hook.result.current.manifest).toBeNull();
    expect(hook.result.current.isReloadingSameVault).toBe(false);
    expect(hook.result.current.loadProgressStore.get()).toEqual({ read: 2, total: 3 });

    await act(async () => {
      finish();
      await opened;
    });
    expect(hook.result.current.status).toBe('loaded');
    expect(hook.result.current.manifest).toBe(full.build.manifest);
    expect(hook.result.current.partialManifest).toBeNull();
    expect(hook.result.current.loadProgressStore.get()).toBeNull();
  });

  it('re-reads an open folder without publishing a part of it', async () => {
    docsVault.buildLocalManifestWithEntries.mockResolvedValue(build(['atlas'], 'first'));
    docsVault.rebuildLocalManifestIncremental.mockRejectedValue(new Error('changed shape'));
    const hook = renderHook(() => useLocalVaultInternal());
    await waitFor(() => expect(hook.result.current.restoreAttempted).toBe(true));
    await act(async () => {
      await hook.result.current.openRecent(record);
    });
    docsVault.buildLocalManifestWithEntries.mockClear();

    await act(async () => {
      await hook.result.current.refresh();
    });
    expect(docsVault.buildLocalManifestWithEntries).toHaveBeenCalledWith(expect.anything(), undefined);
  });
});
