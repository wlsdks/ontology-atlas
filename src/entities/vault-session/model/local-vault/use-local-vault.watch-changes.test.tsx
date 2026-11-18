import { act, renderHook } from '@testing-library/react';
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
  recordLocalFsHandleContents: vi.fn(async () => {}),
}));

const docsVault = vi.hoisted(() => ({
  applyVaultChanges: vi.fn(),
  buildLocalManifestWithEntries: vi.fn(),
  rebuildLocalManifestIncremental: vi.fn(),
  computeLocalVaultFingerprintWithStamps: vi.fn(async () => ({ fingerprint: 'fp-0', nativeStamps: null })),
}));

vi.mock('@/shared/lib/vault-folder/tauri-vault-fs', () => tauri);
vi.mock('@/entities/local-fs-handle', () => ({ CURRENT_LOCAL_FS_HANDLE_ID: 'current', ...store }));
vi.mock('@/entities/docs-vault', () => docsVault);

import { useLocalVaultInternal } from './use-local-vault';

function folder(): FileSystemDirectoryHandle {
  return {
    kind: 'directory',
    name: 'vault',
    rootPath: '/Users/dana/vault',
    getDirectoryHandle: async () => folder(),
    getFileHandle: async () => {
      throw new DOMException('missing', 'NotFoundError');
    },
  } as unknown as FileSystemDirectoryHandle;
}

function snapshot(fingerprint: string, slugs: string[] = []) {
  return {
    build: {
      manifest: {
        version: '1',
        generatedAt: '',
        docs: slugs.map((slug) => ({ slug })),
        backlinksDetail: {},
        tags: {},
        tree: { name: 'root', path: '', type: 'dir' as const },
      },
      fileHandles: new Map(),
      imageHandles: new Map(),
      sourceHandles: new Map(),
      fingerprint,
    },
    entries: [],
  };
}

const edited = { rescan: false, changes: [{ path: 'notes/a.md', kind: 'file' as const, lastModified: 2, size: 4 }] };

async function openVault() {
  const handle = folder();
  store.getLocalFsHandle.mockResolvedValue({ id: 'current', handle, desktopRootPath: '/Users/dana/vault', name: 'vault', createdAt: 1, lastAccessedAt: 1 });
  const hook = renderHook(() => useLocalVaultInternal());
  await vi.waitFor(() => expect(hook.result.current.status).toBe('loaded'));
  docsVault.computeLocalVaultFingerprintWithStamps.mockClear();
  return hook;
}

beforeEach(() => {
  docsVault.buildLocalManifestWithEntries.mockResolvedValue(snapshot('fp-0'));
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('applying the app watcher\'s changed paths', () => {
  it('patches the open manifest without a fingerprint walk', async () => {
    const hook = await openVault();
    const next = snapshot('fp-1', ['notes/a']);
    docsVault.applyVaultChanges.mockResolvedValue({ kind: 'applied', snapshot: next, sidecarsTouched: false });

    await act(() => hook.result.current.applyVaultChangeBatch(edited));

    expect(docsVault.applyVaultChanges).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ entries: [] }), edited.changes);
    expect(hook.result.current.manifest).toBe(next.build.manifest);
    expect(docsVault.computeLocalVaultFingerprintWithStamps).not.toHaveBeenCalled();
    expect(docsVault.rebuildLocalManifestIncremental).not.toHaveBeenCalled();
  });

  it('falls back to the fingerprint check for a rescan and for paths the delta cannot apply', async () => {
    const hook = await openVault();
    await act(() => hook.result.current.applyVaultChangeBatch({ rescan: true, changes: [] }));
    expect(docsVault.applyVaultChanges).not.toHaveBeenCalled();
    expect(docsVault.computeLocalVaultFingerprintWithStamps).toHaveBeenCalledTimes(1);

    docsVault.applyVaultChanges.mockResolvedValue({ kind: 'rescan' });
    await act(() => hook.result.current.applyVaultChangeBatch(edited));
    expect(docsVault.computeLocalVaultFingerprintWithStamps).toHaveBeenCalledTimes(2);
  });

  it('waits for a load in flight and patches the build it commits', async () => {
    const hook = await openVault();
    let finishRebuild: (value: unknown) => void = () => {};
    docsVault.computeLocalVaultFingerprintWithStamps.mockResolvedValue({ fingerprint: 'fp-disk', nativeStamps: null });
    docsVault.rebuildLocalManifestIncremental.mockReturnValue(new Promise((resolve) => { finishRebuild = resolve; }));
    docsVault.applyVaultChanges.mockResolvedValue({ kind: 'unchanged', sidecarsTouched: false });

    let refreshing: Promise<void> = Promise.resolve();
    let applying: Promise<void> = Promise.resolve();
    await act(async () => {
      refreshing = hook.result.current.refresh();
      await vi.waitFor(() => expect(docsVault.rebuildLocalManifestIncremental).toHaveBeenCalled());
      applying = hook.result.current.applyVaultChangeBatch(edited);
    });
    expect(docsVault.applyVaultChanges).not.toHaveBeenCalled();

    const reloaded = snapshot('fp-disk', ['notes/a']);
    await act(async () => {
      finishRebuild(reloaded);
      await Promise.all([refreshing, applying]);
    });
    expect(docsVault.applyVaultChanges).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ build: reloaded.build }), edited.changes);
  });

  it('merges batches that arrive while one is applied into the next delta', async () => {
    const hook = await openVault();
    let finishFirst: (value: unknown) => void = () => {};
    docsVault.applyVaultChanges
      .mockReturnValueOnce(new Promise((resolve) => { finishFirst = resolve; }))
      .mockResolvedValue({ kind: 'unchanged', sidecarsTouched: false });
    const change = (path: string, lastModified: number) => ({ path, kind: 'file' as const, lastModified, size: 1 });

    await act(async () => {
      const first = hook.result.current.applyVaultChangeBatch({ rescan: false, changes: [change('a.md', 1)] });
      await vi.waitFor(() => expect(docsVault.applyVaultChanges).toHaveBeenCalledTimes(1));
      void hook.result.current.applyVaultChangeBatch({ rescan: false, changes: [change('b.md', 1), change('a.md', 2)] });
      void hook.result.current.applyVaultChangeBatch({ rescan: false, changes: [change('c.md', 1)] });
      finishFirst({ kind: 'unchanged', sidecarsTouched: false });
      await first;
    });

    expect(docsVault.applyVaultChanges).toHaveBeenCalledTimes(2);
    expect(docsVault.applyVaultChanges.mock.calls[1][2]).toEqual([change('b.md', 1), change('a.md', 2), change('c.md', 1)]);
  });
});
