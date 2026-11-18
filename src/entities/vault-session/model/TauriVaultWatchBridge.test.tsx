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
  isTauriVaultRuntime: vi.fn(() => false),
  getTauriVaultRootPath: vi.fn(() => null as string | null),
}));

vi.mock('@/shared/lib/vault-folder/tauri-vault-fs', () => ({
  isTauriVaultRuntime: tauriFsMocks.isTauriVaultRuntime,
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
  tauriFsMocks.isTauriVaultRuntime.mockReturnValue(false);
  tauriFsMocks.getTauriVaultRootPath.mockReturnValue(null);
});

describe('TauriVaultWatchBridge', () => {
  it('is a no-op on the web (non-Tauri) runtime and leaves the file watcher off; the 5-second polling fallback covers it', () => {
    localVaultMocks.useLocalVault.mockReturnValue({
      status: 'loaded',
      handle: fakeHandle(),
      applyVaultChangeBatch: vi.fn(),
    });
    tauriFsMocks.isTauriVaultRuntime.mockReturnValue(false);

    render(<TauriVaultWatchBridge />);

    expect(tauriMocks.invoke).not.toHaveBeenCalled();
    expect(tauriMocks.listen).not.toHaveBeenCalled();
  });

  it('starts the file watcher and subscribes to vault-changed events on the Tauri runtime when loaded', async () => {
    tauriFsMocks.isTauriVaultRuntime.mockReturnValue(true);
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

  it('hands every vault-changed batch to the vault, a malformed one as a rescan', async () => {
    tauriFsMocks.isTauriVaultRuntime.mockReturnValue(true);
    tauriFsMocks.getTauriVaultRootPath.mockReturnValue('/Users/me/vault');
    tauriMocks.invoke.mockResolvedValue(undefined);
    const applyVaultChangeBatch = vi.fn(async () => {});
    let capturedHandler: ((event: { payload: unknown }) => void) | null = null;
    tauriMocks.listen.mockImplementation(async (_event: string, handler: (event: { payload: unknown }) => void) => {
      capturedHandler = handler;
      return vi.fn();
    });
    localVaultMocks.useLocalVault.mockReturnValue({
      status: 'loaded',
      handle: fakeHandle(),
      applyVaultChangeBatch,
    });

    render(<TauriVaultWatchBridge />);

    await waitFor(() => expect(capturedHandler).not.toBeNull());
    const batch = { rescan: false, changes: [{ path: 'notes/a.md', kind: 'file', lastModified: 7, size: 3 }] };
    act(() => {
      capturedHandler?.({ payload: batch });
      capturedHandler?.({ payload: null });
    });

    await waitFor(() => expect(applyVaultChangeBatch).toHaveBeenCalledTimes(2));
    expect(applyVaultChangeBatch).toHaveBeenNthCalledWith(1, batch);
    expect(applyVaultChangeBatch).toHaveBeenNthCalledWith(2, { rescan: true, changes: [] });
  });

  it('follows the latest change handler without resubscribing while status and root stay', async () => {
    tauriFsMocks.isTauriVaultRuntime.mockReturnValue(true);
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
    tauriFsMocks.isTauriVaultRuntime.mockReturnValue(true);
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
