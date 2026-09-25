import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { VaultOpenResult } from '@/entities/vault-session';

const tauriFsMocks = vi.hoisted(() => ({
  ensureDefaultVaultParentDir: vi.fn(),
  listTauriDirectoryNames: vi.fn(),
  ensureTauriChildDirectory: vi.fn(),
  createTauriVaultHandle: vi.fn(),
}));

vi.mock('@/shared/lib/tauri-vault-fs', () => ({
  ensureDefaultVaultParentDir: tauriFsMocks.ensureDefaultVaultParentDir,
  listTauriDirectoryNames: tauriFsMocks.listTauriDirectoryNames,
  ensureTauriChildDirectory: tauriFsMocks.ensureTauriChildDirectory,
  createTauriVaultHandle: tauriFsMocks.createTauriVaultHandle,
}));

vi.mock('@/entities/local-fs-handle', () => ({
  CURRENT_LOCAL_FS_HANDLE_ID: 'current',
}));

import { useJustStartVault, type JustStartVaultVault } from './use-just-start-vault';

const OPENED: VaultOpenResult = { opened: true, starterWritten: 12, starterError: null };
const NOT_OPENED: VaultOpenResult = { opened: false, starterWritten: 0, starterError: null };

function makeVault(result: VaultOpenResult = OPENED): JustStartVaultVault & {
  openRecent: ReturnType<typeof vi.fn>;
} {
  return { openRecent: vi.fn(async () => result) };
}

function fakeHandle(name: string): FileSystemDirectoryHandle {
  return { kind: 'directory', name } as unknown as FileSystemDirectoryHandle;
}

describe('useJustStartVault', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tauriFsMocks.ensureDefaultVaultParentDir.mockResolvedValue('/Users/me/Ontology Atlas');
    tauriFsMocks.listTauriDirectoryNames.mockResolvedValue([]);
    tauriFsMocks.createTauriVaultHandle.mockReturnValue(fakeHandle('my-ontology'));
  });

  it('creates the default folder and opens it with the starter in the screen language, then says where', async () => {
    const vault = makeVault();
    const created = vi.fn();
    const { result } = renderHook(() => useJustStartVault(vault, 'ko', { created }));

    await act(async () => {
      await result.current.justStart({ map: false, wiki: true });
    });

    expect(tauriFsMocks.ensureTauriChildDirectory).toHaveBeenCalledWith(
      '/Users/me/Ontology Atlas',
      'my-ontology',
    );
    expect(tauriFsMocks.createTauriVaultHandle).toHaveBeenCalledWith(
      '/Users/me/Ontology Atlas/my-ontology',
    );
    // The starter rides inside the open: the session writes it before the folder is shown, so it
    // does not depend on this hook's screen surviving the open (2026-09-25, D1). Walkthrough
    // 2026-07-26: it is written in the screen's language.
    expect(vault.openRecent).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'current', name: 'my-ontology' }),
      { starter: { locale: 'ko', shape: { map: false, wiki: true } } },
    );
    expect(created).toHaveBeenCalledWith('~/Ontology Atlas/my-ontology');
    expect(result.current.actionError).toBeNull();
  });

  it('asks for the whole starter when nobody chose a shape', async () => {
    const vault = makeVault();
    const { result } = renderHook(() => useJustStartVault(vault, 'en'));

    await act(async () => {
      await result.current.justStart();
    });

    expect(vault.openRecent).toHaveBeenCalledWith(expect.anything(), {
      starter: { locale: 'en', shape: undefined },
    });
  });

  it('picks a numbered name when the base folder is already taken', async () => {
    tauriFsMocks.listTauriDirectoryNames.mockResolvedValue(['my-ontology']);
    tauriFsMocks.createTauriVaultHandle.mockReturnValue(fakeHandle('my-ontology-2'));
    const created = vi.fn();
    const { result } = renderHook(() => useJustStartVault(makeVault(), 'ko', { created }));

    await act(async () => {
      await result.current.justStart();
    });

    expect(tauriFsMocks.ensureTauriChildDirectory).toHaveBeenCalledWith(
      '/Users/me/Ontology Atlas',
      'my-ontology-2',
    );
    expect(created).toHaveBeenCalledWith('~/Ontology Atlas/my-ontology-2');
  });

  it('surfaces an error and opens nothing when the Tauri runtime is unavailable', async () => {
    tauriFsMocks.ensureDefaultVaultParentDir.mockResolvedValue(null);
    const vault = makeVault();
    const { result } = renderHook(() => useJustStartVault(vault, 'ko'));

    await act(async () => {
      await result.current.justStart();
    });

    // A code, not a thrown sentence: the screen looks it up in `failures` and writes the
    // language the reader chose (installed-app inspection before v1.2.2, B2).
    expect(result.current.actionError).toBe('app-required');
    expect(vault.openRecent).not.toHaveBeenCalled();
  });

  it('claims nothing when the freshly created folder does not open', async () => {
    const created = vi.fn();
    const starterFailed = vi.fn();
    const { result } = renderHook(() =>
      useJustStartVault(makeVault(NOT_OPENED), 'ko', { created, starterFailed }),
    );

    await act(async () => {
      await result.current.justStart();
    });

    // The session's own error state speaks for a folder that did not open.
    expect(created).not.toHaveBeenCalled();
    expect(starterFailed).not.toHaveBeenCalled();
    expect(result.current.actionError).toBeNull();
  });

  it('reports a starter that could not be written instead of calling the folder created', async () => {
    const failure = new Error('Operation not permitted (os error 1)');
    const created = vi.fn();
    const starterFailed = vi.fn();
    const { result } = renderHook(() =>
      useJustStartVault(
        makeVault({ opened: true, starterWritten: 0, starterError: failure }),
        'ko',
        { created, starterFailed },
      ),
    );

    await act(async () => {
      await result.current.justStart();
    });

    expect(starterFailed).toHaveBeenCalledWith(failure);
    expect(created).not.toHaveBeenCalled();
  });

  it('keeps a starter failure on screen as a code when no reporter outlives the screen', async () => {
    const { result } = renderHook(() =>
      useJustStartVault(
        makeVault({
          opened: true,
          starterWritten: 0,
          starterError: new Error('Operation not permitted (os error 1)'),
        }),
        'ko',
      ),
    );

    await act(async () => {
      await result.current.justStart();
    });

    expect(result.current.actionError).toBe('permission-denied');
  });

  it('finishes and reports even when its screen is gone before the folder opens (D1)', async () => {
    let resolveOpen: (value: VaultOpenResult) => void = () => undefined;
    const vault: JustStartVaultVault = {
      openRecent: vi.fn(() => new Promise<VaultOpenResult>((resolve) => { resolveOpen = resolve; })),
    };
    const created = vi.fn();
    const { result, unmount } = renderHook(() => useJustStartVault(vault, 'ko', { created }));

    let pending: Promise<void> = Promise.resolve();
    await act(async () => {
      pending = result.current.justStart();
      await Promise.resolve();
    });
    await vi.waitFor(() => expect(vault.openRecent).toHaveBeenCalledTimes(1));
    // The shell swaps the first-run screen for the opening pane as soon as the open begins.
    unmount();
    resolveOpen(OPENED);
    await pending;

    expect(vault.openRecent).toHaveBeenCalledWith(expect.anything(), {
      starter: { locale: 'ko', shape: undefined },
    });
    expect(created).toHaveBeenCalledWith('~/Ontology Atlas/my-ontology');
  });
});
