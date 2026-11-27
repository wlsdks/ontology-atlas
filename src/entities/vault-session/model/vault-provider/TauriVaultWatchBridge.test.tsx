import { act, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Risk path — TauriVaultWatchBridge's mapping from a Rust file-watcher event to a poll trigger.
 *
 * On desktop it is the only path making the screen follow the instant an agent writes to disk. Wired
 * wrongly it either leaves the screen stale when an OS event arrives (editing on stale data until the
 * next save conflicts) or, in the other direction, registers duplicate listeners so several refreshes
 * overlap.
 */

const tauriMocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  listen: vi.fn(),
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: tauriMocks.invoke,
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: tauriMocks.listen,
}));

const tauriFsMocks = vi.hoisted(() => ({
  getTauriVaultRootPath: vi.fn(() => null as string | null),
}));

vi.mock('@/shared/lib/vault-folder/native-vault/tauri-vault-runtime', () => ({
  getTauriVaultRootPath: tauriFsMocks.getTauriVaultRootPath,
}));

const localVaultMocks = vi.hoisted(() => ({
  useLocalVault: vi.fn(),
}));

vi.mock('./local-vault-context', () => ({
  useLocalVault: localVaultMocks.useLocalVault,
}));

import { TauriVaultWatchBridge } from './TauriVaultWatchBridge';

function fakeHandle(name = 'vault'): FileSystemDirectoryHandle {
  return { kind: 'directory', name } as unknown as FileSystemDirectoryHandle;
}

afterEach(() => {
  vi.clearAllMocks();
  tauriFsMocks.getTauriVaultRootPath.mockReturnValue(null);
});

describe('TauriVaultWatchBridge', () => {
  it('leaves the file watcher off for a folder with no native path; the 5-second polling covers it', () => {
    localVaultMocks.useLocalVault.mockReturnValue({
      status: 'loaded',
      handle: fakeHandle(),
      applyVaultChangeBatch: vi.fn(),
    });

    render(<TauriVaultWatchBridge />);

    expect(tauriMocks.invoke).not.toHaveBeenCalled();
    expect(tauriMocks.listen).not.toHaveBeenCalled();
  });

  it('starts the file watcher and subscribes to vault-changed events on the Tauri runtime when loaded', async () => {
    tauriFsMocks.getTauriVaultRootPath.mockReturnValue('/Users/me/vault');
    tauriMocks.invoke.mockResolvedValue(undefined);
    const unlisten = vi.fn();
    tauriMocks.listen.mockResolvedValue(unlisten);
    localVaultMocks.useLocalVault.mockReturnValue({
      status: 'loaded',
      handle: fakeHandle(),
      applyVaultChangeBatch: vi.fn(),
    });

    render(<TauriVaultWatchBridge />);

    await waitFor(() =>
      expect(tauriMocks.invoke).toHaveBeenCalledWith('start_vault_watch', {
        rootPath: '/Users/me/vault',
      }),
    );
    await waitFor(() => expect(tauriMocks.listen).toHaveBeenCalledWith('vault-changed', expect.any(Function)));
  });

  it('hands each batch for the watched folder to the vault with its handle, a malformed one as a rescan, and drops another folder\'s', async () => {
    tauriFsMocks.getTauriVaultRootPath.mockReturnValue('/Users/me/vault');
    // The watcher answers with the canonical root its batches name.
    tauriMocks.invoke.mockResolvedValue('/private/Users/me/vault');
    const applyVaultChangeBatch = vi.fn(async () => {});
    let capturedHandler: ((event: { payload: unknown }) => void) | null = null;
    tauriMocks.listen.mockImplementation(async (_event: string, handler: (event: { payload: unknown }) => void) => {
      capturedHandler = handler;
      return vi.fn();
    });
    const handle = fakeHandle();
    localVaultMocks.useLocalVault.mockReturnValue({
      status: 'loaded',
      handle,
      applyVaultChangeBatch,
    });

    render(<TauriVaultWatchBridge />);

    await waitFor(() => expect(capturedHandler).not.toBeNull());
    const changes = [{ path: 'notes/a.md', kind: 'file', lastModified: 7, size: 3 }];
    const batch = { root: '/private/Users/me/vault', rescan: false, changes };
    act(() => {
      capturedHandler?.({ payload: { root: '/Users/me/previous', rescan: false, changes } });
      capturedHandler?.({ payload: { root: '/Users/me/previous', rescan: true, changes: [] } });
      capturedHandler?.({ payload: batch });
      capturedHandler?.({ payload: null });
    });

    await waitFor(() => expect(applyVaultChangeBatch).toHaveBeenCalledTimes(2));
    expect(applyVaultChangeBatch).toHaveBeenNthCalledWith(1, batch, handle);
    expect(applyVaultChangeBatch).toHaveBeenNthCalledWith(2, { root: null, rescan: true, changes: [] }, handle);
  });

  it('follows the latest change handler without resubscribing while status and root stay', async () => {
    tauriFsMocks.getTauriVaultRootPath.mockReturnValue('/Users/me/vault');
    tauriMocks.invoke.mockResolvedValue(undefined);
    let capturedHandler: ((event: { payload: unknown }) => void) | null = null;
    tauriMocks.listen.mockImplementation(async (_event: string, handler: (event: { payload: unknown }) => void) => {
      capturedHandler = handler;
      return vi.fn();
    });
    const firstApply = vi.fn(async () => false);
    const secondApply = vi.fn(async () => false);
    localVaultMocks.useLocalVault.mockReturnValue({
      status: 'loaded',
      handle: fakeHandle(),
      applyVaultChangeBatch: firstApply,
    });

    const { rerender } = render(<TauriVaultWatchBridge />);
    await waitFor(() => expect(tauriMocks.listen).toHaveBeenCalledTimes(1));

    // A re-render where only the `applyVaultChangeBatch` reference changes while status and handle stay —
    // common after every load(). It must not resubscribe (call listen again).
    localVaultMocks.useLocalVault.mockReturnValue({
      status: 'loaded',
      handle: fakeHandle(),
      applyVaultChangeBatch: secondApply,
    });
    rerender(<TauriVaultWatchBridge />);

    expect(tauriMocks.listen).toHaveBeenCalledTimes(1); // no resubscribe

    act(() => {
      capturedHandler?.({ payload: { rescan: true, changes: [] } });
    });
    await waitFor(() => expect(secondApply).toHaveBeenCalledTimes(1));
    expect(firstApply).not.toHaveBeenCalled();
  });

  it('does not throw when invoke fails (permission denied and the like); the polling fallback must keep covering', async () => {
    tauriFsMocks.getTauriVaultRootPath.mockReturnValue('/Users/me/vault');
    tauriMocks.invoke.mockRejectedValue(new Error('permission denied'));
    localVaultMocks.useLocalVault.mockReturnValue({
      status: 'loaded',
      handle: fakeHandle(),
      applyVaultChangeBatch: vi.fn(),
    });

    expect(() => render(<TauriVaultWatchBridge />)).not.toThrow();
    await waitFor(() => expect(tauriMocks.invoke).toHaveBeenCalledTimes(1));
    expect(tauriMocks.listen).not.toHaveBeenCalled();
  });
});
