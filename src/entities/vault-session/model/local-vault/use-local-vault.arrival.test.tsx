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

function folder(name: string): LocalFsHandleRecord {
  const rootPath = `/Users/dana/${name}`;
  return {
    id: 'current',
    handle: { kind: 'directory', name, rootPath } as unknown as FileSystemDirectoryHandle,
    desktopRootPath: rootPath,
    name,
    createdAt: 1,
    lastAccessedAt: 1,
  };
}

const record = folder('vault');

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
    await waitFor(() => expect(hook.result.current.arrivalStore.get()).toBe(partial.build.manifest));
    expect(hook.result.current.partialTotal).toBe(3);
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
    expect(hook.result.current.partialTotal).toBe(0);
    expect(hook.result.current.loadProgressStore.get()).toBeNull();
  });

  it('lets the read part go once the folder settles, even from a screen that kept the arriving value', async () => {
    const partial = build(['atlas', 'domains/order'], 'partial');
    let finish: () => void = () => undefined;
    docsVault.buildLocalManifestWithEntries.mockImplementation(
      async (_handle: FileSystemDirectoryHandle, observer?: VaultBuildObserver) => {
        observer?.onPartial?.(partial.build as never, { read: 2, total: 3 });
        await new Promise<void>((resolve) => {
          finish = resolve;
        });
        return build(['atlas', 'domains/order', 'capabilities/checkout'], 'full');
      },
    );
    const hook = renderHook(() => useLocalVaultInternal());
    await waitFor(() => expect(hook.result.current.restoreAttempted).toBe(true));
    let opened: Promise<unknown> = Promise.resolve();
    act(() => {
      opened = hook.result.current.openRecent(record);
    });
    await waitFor(() => expect(hook.result.current.partialTotal).toBe(3));
    const keptWhileArriving = hook.result.current;

    await act(async () => {
      finish();
      await opened;
    });
    expect(Object.values(keptWhileArriving)).not.toContain(partial.build.manifest);
    expect(keptWhileArriving.arrivalStore.get()).toBeNull();
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

  it('drops the previous folder the moment the next one starts arriving, so nothing writes into it', async () => {
    const written = vi.fn();
    const orderHandle = {
      kind: 'file',
      name: 'order.md',
      getFile: async () => ({ lastModified: 1, text: async () => '# order' }),
      createWritable: async () => ({ write: written, close: async () => undefined }),
    } as unknown as FileSystemFileHandle;
    const first = build(['domains/order'], 'a');
    first.build.fileHandles.set('domains/order', orderHandle);
    docsVault.buildLocalManifestWithEntries.mockResolvedValueOnce(first);
    const hook = renderHook(() => useLocalVaultInternal());
    await waitFor(() => expect(hook.result.current.restoreAttempted).toBe(true));
    await act(async () => {
      await hook.result.current.openRecent(folder('a'));
    });
    expect(hook.result.current.fileHandles.size).toBe(1);

    const partial = build(['domains/order'], 'b-part');
    docsVault.buildLocalManifestWithEntries.mockImplementationOnce(
      async (_handle: FileSystemDirectoryHandle, observer?: VaultBuildObserver) => {
        observer?.onPartial?.(partial.build as never, { read: 1, total: 900 });
        return new Promise(() => undefined);
      },
    );
    act(() => {
      void hook.result.current.openRecent(folder('b'));
    });
    await waitFor(() => expect(hook.result.current.arrivalStore.get()).toBe(partial.build.manifest));
    expect(hook.result.current.partialTotal).toBe(900);
    expect(hook.result.current.manifest).toBeNull();
    expect(hook.result.current.fileHandles.size).toBe(0);
    expect(hook.result.current.imageHandles.size).toBe(0);
    expect(hook.result.current.sourceHandles.size).toBe(0);
    await expect(hook.result.current.saveDoc('domains/order', '# changed')).rejects.toThrow('still being read');
    expect(written).not.toHaveBeenCalled();
  });

  it('never shows a count from a read that has settled or a folder that was left', async () => {
    let lateProgress: VaultBuildObserver['onProgress'];
    docsVault.buildLocalManifestWithEntries.mockImplementationOnce(
      async (_handle: FileSystemDirectoryHandle, observer?: VaultBuildObserver) => {
        lateProgress = observer?.onProgress;
        observer?.onProgress?.({ read: 3, total: 900 });
        throw new Error('unreadable');
      },
    );
    const hook = renderHook(() => useLocalVaultInternal());
    await waitFor(() => expect(hook.result.current.restoreAttempted).toBe(true));
    await act(async () => {
      await hook.result.current.openRecent(record);
    });
    expect(hook.result.current.status).toBe('error');
    lateProgress?.({ read: 4, total: 900 });
    expect(hook.result.current.loadProgressStore.get()).toBeNull();

    docsVault.buildLocalManifestWithEntries.mockImplementationOnce(
      async (_handle: FileSystemDirectoryHandle, observer?: VaultBuildObserver) => {
        observer?.onProgress?.({ read: 5, total: 900 });
        return new Promise(() => undefined);
      },
    );
    act(() => {
      void hook.result.current.openRecent(record);
    });
    await waitFor(() => expect(hook.result.current.loadProgressStore.get()).toEqual({ read: 5, total: 900 }));
    await act(async () => {
      await hook.result.current.close();
    });
    expect(hook.result.current.loadProgressStore.get()).toBeNull();
  });
});
