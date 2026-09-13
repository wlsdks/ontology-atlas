import { renderHook, waitFor } from '@testing-library/react';
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

function successfulBuild() {
  return {
    build: {
      manifest: {
        version: '1',
        generatedAt: '',
        docs: [
          { slug: 'project', path: 'project.md', frontmatter: { kind: 'project' } },
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
