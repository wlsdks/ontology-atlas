import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LocalFsHandleRecord } from '@/entities/local-fs-handle';

/**
 * **The launch path is decided by how many folders are known, and by nothing else.**
 *
 * Owner report, relaunching the installed app (2026-09-13): once you have set the app up,
 * relaunching always puts you back in the same folder, with no say in it.
 *
 * These tests hold the two halves of the rule and the reason there is no third option:
 *
 *  1. **One folder resumes silently.** A chooser here would be a toll on every launch for a
 *     screen with one button, so the restore must still load without asking.
 *  2. **Two or more stops at the chooser.** The app cannot know which was meant, and the
 *     stored `current` record must survive untouched - it is the answer to "which folder was
 *     I in last", which the chooser marks.
 *
 * There is deliberately no preference consulted in either case. A setting would be one more
 * control nobody finds, and not finding the control is the defect, not a detail of it.
 */

const tauri = vi.hoisted(() => ({
  isTauriVaultRuntime: vi.fn(() => true),
  tauriVaultPathExists: vi.fn(async () => true),
  listTauriDirectoryNames: vi.fn<(rootPath: string) => Promise<string[]>>(async () => []),
  createTauriVaultHandle: vi.fn((rootPath: string) => ({
    kind: 'directory' as const,
    name: rootPath.split('/').pop() ?? rootPath,
    rootPath,
  })),
  getTauriVaultRootPath: vi.fn((h: { rootPath?: string }) => h?.rootPath),
  pickTauriVaultDirectory: vi.fn(),
}));

const store = vi.hoisted(() => ({
  getLocalFsHandle: vi.fn<() => Promise<LocalFsHandleRecord | undefined>>(
    async () => undefined,
  ),
  listRecentLocalFsHandles: vi.fn(async () => [] as LocalFsHandleRecord[]),
  putLocalFsHandle: vi.fn(async () => {}),
  recordLocalFsHandleContents: vi.fn(async () => {}),
  touchLocalFsHandle: vi.fn(async () => {}),
  forgetRecentLocalFsHandle: vi.fn(async () => {}),
  deleteLocalFsHandle: vi.fn(async () => {}),
  verifyHandlePermission: vi.fn<() => Promise<PermissionState>>(async () => 'granted'),
}));

const docsVault = vi.hoisted(() => ({
  buildLocalManifestWithEntries: vi.fn(),
  rebuildLocalManifestIncremental: vi.fn(),
  computeLocalVaultFingerprint: vi.fn(async () => 'fp'),
  computeLocalVaultFingerprintWithStamps: vi.fn(async () => ({ fingerprint: 'changed', nativeStamps: null })),
}));

vi.mock('@/shared/lib/tauri-vault-fs', () => tauri);
vi.mock('@/entities/local-fs-handle', () => ({
  CURRENT_LOCAL_FS_HANDLE_ID: 'current',
  ...store,
}));
vi.mock('@/entities/docs-vault', () => docsVault);

import { useLocalVaultInternal } from './use-local-vault';

function record(name: string, docs = 0, concepts = 0): LocalFsHandleRecord {
  const rootPath = `/Users/dana/vaults/${name}`;
  return {
    id: 'current',
    handle: {
      kind: 'directory',
      name,
      rootPath,
    } as unknown as FileSystemDirectoryHandle,
    desktopRootPath: rootPath,
    name,
    createdAt: 1,
    lastAccessedAt: 1,
    docCount: docs,
    conceptCount: concepts,
    countedAt: 1,
  };
}

function successfulBuild(slug = 'project') {
  return {
    build: {
      manifest: {
        version: '1',
        generatedAt: '',
        docs: [
          { slug, path: `${slug}.md`, frontmatter: { kind: 'project' } },
          { slug: 'wiki/notes', path: 'wiki/notes.md', frontmatter: {} },
        ],
        backlinksDetail: {},
        tags: {},
        tree: { name: 'root', path: '', type: 'dir' as const },
      },
      fileHandles: new Map(),
      imageHandles: new Map(),
      sourceHandles: new Map(),
      fingerprint: 'fp',
    },
    entries: [],
  };
}

beforeEach(() => {
  tauri.isTauriVaultRuntime.mockReturnValue(true);
  tauri.tauriVaultPathExists.mockResolvedValue(true);
  tauri.listTauriDirectoryNames.mockResolvedValue([]);
  store.getLocalFsHandle.mockResolvedValue(undefined);
  store.listRecentLocalFsHandles.mockResolvedValue([]);
  docsVault.buildLocalManifestWithEntries.mockResolvedValue(successfulBuild());
  docsVault.rebuildLocalManifestIncremental.mockResolvedValue(successfulBuild());
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

describe('obsolete vault reads', () => {
  it.each([
    ['replace', 'complete'], ['replace', 'fail'], ['close', 'complete'], ['close', 'fail'],
  ] as const)('does not publish a delayed load after %s when it later %s', async (action, outcome) => {
    const a = record('A');
    const b = record('B');
    const started = deferred<void>();
    const delayed = deferred<ReturnType<typeof successfulBuild>>();
    docsVault.buildLocalManifestWithEntries.mockImplementationOnce(() => {
      started.resolve();
      return delayed.promise;
    });
    const hook = renderHook(() => useLocalVaultInternal());
    await waitFor(() => expect(hook.result.current.restoreAttempted).toBe(true));
    let pending!: ReturnType<typeof hook.result.current.openRecent>;
    await act(async () => { pending = hook.result.current.openRecent(a); await started.promise; });
    await act(async () => {
      if (action === 'replace') await hook.result.current.openRecent(b);
      else await hook.result.current.close();
    });
    const countWrites = store.recordLocalFsHandleContents.mock.calls.length;
    await act(async () => {
      if (outcome === 'complete') delayed.resolve(successfulBuild());
      else delayed.reject(new Error('Obsolete folder read failed'));
      expect((await pending).opened).toBe(false);
    });
    expect(hook.result.current.handle).toBe(action === 'replace' ? b.handle : null);
    expect(hook.result.current.status).toBe(action === 'replace' ? 'loaded' : 'idle');
    expect(store.recordLocalFsHandleContents).toHaveBeenCalledTimes(countWrites);
    hook.unmount();
  });

  it('does not publish counts or report an open after unmount', async () => {
    const started = deferred<void>();
    const delayed = deferred<ReturnType<typeof successfulBuild>>();
    docsVault.buildLocalManifestWithEntries.mockImplementationOnce(() => {
      started.resolve();
      return delayed.promise;
    });
    const hook = renderHook(() => useLocalVaultInternal());
    await waitFor(() => expect(hook.result.current.restoreAttempted).toBe(true));
    let pending!: ReturnType<typeof hook.result.current.openRecent>;
    await act(async () => { pending = hook.result.current.openRecent(record('A')); await started.promise; });
    hook.unmount();
    delayed.resolve(successfulBuild());
    expect((await pending).opened).toBe(false);
    expect(store.recordLocalFsHandleContents).not.toHaveBeenCalled();
  });

  it.each([true, false])('ignores an obsolete folder preflight returning %s', async (exists) => {
    const a = record('A');
    const b = record('B');
    const started = deferred<void>();
    const delayed = deferred<boolean>();
    tauri.tauriVaultPathExists.mockImplementationOnce(() => { started.resolve(); return delayed.promise; });
    const hook = renderHook(() => useLocalVaultInternal());
    await waitFor(() => expect(hook.result.current.restoreAttempted).toBe(true));
    let pending!: ReturnType<typeof hook.result.current.openRecent>;
    await act(async () => { pending = hook.result.current.openRecent(a); await started.promise; });
    await act(async () => { await hook.result.current.openRecent(b); });
    await act(async () => { delayed.resolve(exists); expect((await pending).opened).toBe(false); });
    expect(hook.result.current.handle).toBe(b.handle);
    expect(hook.result.current.status).toBe('loaded');
    expect(docsVault.buildLocalManifestWithEntries.mock.calls.map(([handle]) => handle)).toEqual([b.handle]);
    hook.unmount();
  });

  it.each(['refresh', 'syncWithDisk'] as const)('ignores an obsolete fingerprint from %s before it reloads the previous folder', async (method) => {
    const a = record('A');
    const b = record('B');
    const hook = renderHook(() => useLocalVaultInternal());
    await waitFor(() => expect(hook.result.current.restoreAttempted).toBe(true));
    await act(async () => { await hook.result.current.openRecent(a); });
    const started = deferred<void>();
    const delayed = deferred<{ fingerprint: string; nativeStamps: null }>();
    docsVault.computeLocalVaultFingerprintWithStamps.mockImplementationOnce(() => { started.resolve(); return delayed.promise; });
    let pending!: Promise<void | boolean>;
    await act(async () => { pending = hook.result.current[method](); await started.promise; });
    await act(async () => { await hook.result.current.openRecent(b); });
    await act(async () => { delayed.resolve({ fingerprint: 'changed', nativeStamps: null }); await pending; });
    expect(hook.result.current.handle).toBe(b.handle);
    expect(docsVault.buildLocalManifestWithEntries).toHaveBeenCalledTimes(2);
    hook.unmount();
  });

  it('does not let a delayed restore replace an explicitly opened folder', async () => {
    const delayed = deferred<LocalFsHandleRecord | undefined>();
    store.getLocalFsHandle.mockReturnValueOnce(delayed.promise);
    const hook = renderHook(() => useLocalVaultInternal());
    const b = record('B');
    await act(async () => { await hook.result.current.openRecent(b); });
    await act(async () => { delayed.resolve(record('A')); });
    await waitFor(() => expect(hook.result.current.restoreAttempted).toBe(true));
    expect(hook.result.current.handle).toBe(b.handle);
    expect(docsVault.buildLocalManifestWithEntries).toHaveBeenCalledTimes(1);
    hook.unmount();
  });

  it('keeps the newer same-folder rebuild after an older rebuild completes', async () => {
    const hook = renderHook(() => useLocalVaultInternal());
    await waitFor(() => expect(hook.result.current.restoreAttempted).toBe(true));
    await act(async () => { await hook.result.current.openRecent(record('A')); });
    const started = deferred<void>();
    const delayed = deferred<ReturnType<typeof successfulBuild>>();
    docsVault.rebuildLocalManifestIncremental
      .mockImplementationOnce(() => { started.resolve(); return delayed.promise; })
      .mockResolvedValueOnce(successfulBuild('newer'));
    let pending!: Promise<void>;
    await act(async () => { pending = hook.result.current.refresh(); await started.promise; });
    await act(async () => { await hook.result.current.refresh(); });
    expect(hook.result.current.manifest?.docs[0]?.slug).toBe('newer');
    await act(async () => { delayed.resolve(successfulBuild('older')); await pending; });
    expect(hook.result.current.manifest?.docs[0]?.slug).toBe('newer');
    hook.unmount();
  });

  it('rebuilds a reopened folder without retaining its closed-session entries', async () => {
    const a = record('A');
    const hook = renderHook(() => useLocalVaultInternal());
    await waitFor(() => expect(hook.result.current.restoreAttempted).toBe(true));
    await act(async () => { await hook.result.current.openRecent(a); });
    await act(async () => { await hook.result.current.close(); });
    await act(async () => { await hook.result.current.openRecent(a); });
    expect(docsVault.buildLocalManifestWithEntries).toHaveBeenCalledTimes(2);
    expect(docsVault.rebuildLocalManifestIncremental).not.toHaveBeenCalled();
    hook.unmount();
  });

  it('lets an explicit pending picker win over a delayed boot restore', async () => {
    const restoring = deferred<LocalFsHandleRecord | undefined>();
    const picking = deferred<FileSystemDirectoryHandle>();
    const started = deferred<void>();
    store.getLocalFsHandle.mockReturnValueOnce(restoring.promise);
    tauri.pickTauriVaultDirectory.mockImplementationOnce(() => { started.resolve(); return picking.promise; });
    const hook = renderHook(() => useLocalVaultInternal());
    const b = record('B');
    let pending!: ReturnType<typeof hook.result.current.open>;
    await act(async () => { pending = hook.result.current.open(); await started.promise; });
    await act(async () => { restoring.resolve(record('A')); });
    await waitFor(() => expect(hook.result.current.restoreAttempted).toBe(true));
    await act(async () => { picking.resolve(b.handle); expect((await pending).opened).toBe(true); });
    expect(hook.result.current.handle).toBe(b.handle);
    expect(docsVault.buildLocalManifestWithEntries).toHaveBeenCalledTimes(1);
    hook.unmount();
  });

  it.each(['open', 'openRecent'] as const)('does not report success from %s after close during recent-list readback', async (method) => {
    const hook = renderHook(() => useLocalVaultInternal());
    await waitFor(() => expect(hook.result.current.restoreAttempted).toBe(true));
    const started = deferred<void>();
    const delayed = deferred<LocalFsHandleRecord[]>();
    store.listRecentLocalFsHandles.mockImplementationOnce(() => { started.resolve(); return delayed.promise; });
    const a = record('A');
    tauri.pickTauriVaultDirectory.mockResolvedValueOnce(a.handle);
    let pending!: ReturnType<typeof hook.result.current.open>;
    await act(async () => {
      pending = method === 'open' ? hook.result.current.open() : hook.result.current.openRecent(a);
      await started.promise;
    });
    await act(async () => { await hook.result.current.close(); });
    await act(async () => { delayed.resolve([]); expect((await pending).opened).toBe(false); });
    expect(hook.result.current.status).toBe('idle');
    hook.unmount();
  });

  it('closes the read session even when deleting saved metadata fails', async () => {
    const hook = renderHook(() => useLocalVaultInternal());
    await waitFor(() => expect(hook.result.current.restoreAttempted).toBe(true));
    await act(async () => { await hook.result.current.openRecent(record('A')); });
    store.deleteLocalFsHandle.mockRejectedValueOnce(new Error('Fixture metadata failure'));
    await act(async () => { await expect(hook.result.current.close()).rejects.toThrow('Fixture metadata failure'); });
    expect(hook.result.current.handle).toBeNull();
    expect(hook.result.current.status).toBe('idle');
    hook.unmount();
  });

  it('retries a failed rebuild even when the disk fingerprint matches the last success', async () => {
    const hook = renderHook(() => useLocalVaultInternal());
    await waitFor(() => expect(hook.result.current.restoreAttempted).toBe(true));
    await act(async () => { await hook.result.current.openRecent(record('A')); });
    docsVault.rebuildLocalManifestIncremental.mockRejectedValueOnce(new Error('Fixture incremental failure'));
    docsVault.buildLocalManifestWithEntries.mockRejectedValueOnce(new Error('Fixture rebuild failure'));
    await act(async () => { await hook.result.current.refresh(); });
    expect(hook.result.current.status).toBe('error');
    docsVault.computeLocalVaultFingerprintWithStamps.mockResolvedValueOnce({ fingerprint: 'fp', nativeStamps: null });
    await act(async () => { await hook.result.current.refresh(); });
    expect(hook.result.current.status).toBe('loaded');
    hook.unmount();
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('useLocalVaultInternal launch path', () => {
  it('resumes without asking when exactly one folder is known', async () => {
    const only = record('atlas');
    store.getLocalFsHandle.mockResolvedValue(only);
    store.listRecentLocalFsHandles.mockResolvedValue([only]);

    const hook = renderHook(() => useLocalVaultInternal());

    await waitFor(() => expect(hook.result.current.status).toBe('loaded'));
    expect(hook.result.current.awaitingVaultChoice).toBe(false);
    expect(docsVault.buildLocalManifestWithEntries).toHaveBeenCalledTimes(1);
  });

  it('stops at the chooser when two folders are known, and reads neither', async () => {
    const current = record('atlas');
    store.getLocalFsHandle.mockResolvedValue(current);
    store.listRecentLocalFsHandles.mockResolvedValue([current, record('atlas-old')]);

    const hook = renderHook(() => useLocalVaultInternal());

    await waitFor(() => expect(hook.result.current.restoreAttempted).toBe(true));
    expect(hook.result.current.awaitingVaultChoice).toBe(true);
    // 'idle' rather than an error or a permission prompt: nothing failed and nothing is
    // missing. This is the state `shouldShowDesktopVaultWelcome` already renders the folder
    // screen for, which is how the chooser that was always built becomes reachable.
    expect(hook.result.current.status).toBe('idle');
    expect(hook.result.current.manifest).toBeNull();
    // Not one folder was walked. Loading the last one "just in case" would spend a full
    // vault read on a folder the person may not have picked, and would then have to be
    // thrown away.
    expect(docsVault.buildLocalManifestWithEntries).not.toHaveBeenCalled();
  });

  it('keeps the stored current record so the chooser can mark where you were', async () => {
    const current = record('atlas');
    store.getLocalFsHandle.mockResolvedValue(current);
    store.listRecentLocalFsHandles.mockResolvedValue([record('atlas-old'), current]);

    const hook = renderHook(() => useLocalVaultInternal());

    await waitFor(() => expect(hook.result.current.awaitingVaultChoice).toBe(true));
    expect(hook.result.current.storedVaultRecord?.desktopRootPath).toBe(
      '/Users/dana/vaults/atlas',
    );
    // Deferring must not be confused with closing. `close()` deletes the `current` record,
    // which would throw away the answer to "which folder was I in last" - and the chooser's
    // "last open" mark is exactly that answer. The list order cannot stand in for it: this
    // case deliberately puts the stored folder second.
    expect(store.deleteLocalFsHandle).not.toHaveBeenCalled();
  });

  it('ends the choosing state when a folder is opened from the chooser', async () => {
    const current = record('atlas');
    const other = record('atlas-old');
    store.getLocalFsHandle.mockResolvedValue(current);
    store.listRecentLocalFsHandles.mockResolvedValue([current, other]);

    const hook = renderHook(() => useLocalVaultInternal());
    await waitFor(() => expect(hook.result.current.awaitingVaultChoice).toBe(true));

    await hook.result.current.openRecent(other);

    await waitFor(() => expect(hook.result.current.status).toBe('loaded'));
    expect(hook.result.current.awaitingVaultChoice).toBe(false);
  });

  it('does not stop when there is no stored folder at all', async () => {
    // A first run has an empty recent list, so the count rule cannot fire. The distinction
    // matters: the same screen appears, but for a different reason, and it must not claim
    // the person is choosing between folders they do not have.
    store.getLocalFsHandle.mockResolvedValue(undefined);
    store.listRecentLocalFsHandles.mockResolvedValue([]);

    const hook = renderHook(() => useLocalVaultInternal());

    await waitFor(() => expect(hook.result.current.restoreAttempted).toBe(true));
    expect(hook.result.current.awaitingVaultChoice).toBe(false);
    expect(hook.result.current.status).toBe('idle');
  });

  it('does not make a load wait for the count to be written', async () => {
    /*
     * **`load()` resolving means "the manifest is live", and nothing may be added to that
     * promise.** `handleRenameCurrent` awaits `renameDoc` (which loads) and only then records
     * the slugs it touched in the guard that keeps the missing-document verdict quiet for the
     * app's own action. An awaited cache write after `setState` let React commit the rename
     * while that guard was still empty, so the screen told the person the document they had
     * just renamed could not be found (`tests/e2e/docs-rename-address.spec.ts`, CI 2026-09-13).
     *
     * `restoreAttempted` is the observable: the restore awaits `load` and only then settles
     * that flag in its `finally`. So a `load` held open by the cache write leaves the flag
     * false - and the whole app waits on that flag, which is the same stall in a different
     * costume. The write here never settles, which is the shape of an IndexedDB round trip
     * cut off by a navigation.
     */
    const only = record('atlas');
    store.getLocalFsHandle.mockResolvedValue(only);
    store.listRecentLocalFsHandles.mockResolvedValue([only]);
    let settleWrite = () => {};
    store.recordLocalFsHandleContents.mockReturnValue(
      new Promise<void>((resolve) => {
        settleWrite = () => resolve();
      }),
    );

    const hook = renderHook(() => useLocalVaultInternal());

    // The manifest goes live regardless - that half was never in doubt.
    await waitFor(() => expect(hook.result.current.status).toBe('loaded'));
    expect(store.recordLocalFsHandleContents).toHaveBeenCalled();
    // And the load it belongs to finished, so every caller awaiting it can proceed.
    await waitFor(
      () => expect(hook.result.current.restoreAttempted).toBe(true),
      { timeout: 2000 },
    );
    settleWrite();
  });

  it('records what the folder held once it is actually read', async () => {
    const only = record('atlas');
    store.getLocalFsHandle.mockResolvedValue(only);
    store.listRecentLocalFsHandles.mockResolvedValue([only]);

    const hook = renderHook(() => useLocalVaultInternal());
    await waitFor(() => expect(hook.result.current.status).toBe('loaded'));

    // Two documents, one of which is a kind-bearing node outside `wiki/`. The counts are
    // taken by the path that already paid for the walk, which is why a chooser row can say
    // what is inside a folder it has not opened.
    await waitFor(() =>
      expect(store.recordLocalFsHandleContents).toHaveBeenCalledWith({
        docCount: 2,
        conceptCount: 1,
      }),
    );
  });
});
