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

vi.mock('@/shared/lib/tauri-vault-fs', () => ({
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
  it('웹(비-Tauri) 런타임에서는 no-op — 파일워처를 켜지 않는다 (5초 폴링 fallback 이 커버)', () => {
    localVaultMocks.useLocalVault.mockReturnValue({
      status: 'loaded',
      handle: fakeHandle(),
      syncWithDisk: vi.fn(),
    });
    tauriFsMocks.isTauriVaultRuntime.mockReturnValue(false);

    render(<TauriVaultWatchBridge />);

    expect(tauriMocks.invoke).not.toHaveBeenCalled();
    expect(tauriMocks.listen).not.toHaveBeenCalled();
  });

  it('Tauri 런타임 + loaded 상태면 파일워처를 켜고 vault-changed 이벤트를 구독한다', async () => {
    tauriFsMocks.isTauriVaultRuntime.mockReturnValue(true);
    tauriFsMocks.getTauriVaultRootPath.mockReturnValue('/Users/me/vault');
    tauriMocks.invoke.mockResolvedValue(undefined);
    const unlisten = vi.fn();
    tauriMocks.listen.mockResolvedValue(unlisten);
    localVaultMocks.useLocalVault.mockReturnValue({
      status: 'loaded',
      handle: fakeHandle(),
      syncWithDisk: vi.fn(),
    });

    render(<TauriVaultWatchBridge />);

    await waitFor(() =>
      expect(tauriMocks.invoke).toHaveBeenCalledWith('start_vault_watch', {
        rootPath: '/Users/me/vault',
      }),
    );
    await waitFor(() => expect(tauriMocks.listen).toHaveBeenCalledWith('vault-changed', expect.any(Function)));
  });

  it('checks the folder on every vault-changed event, the app\'s only live signal', async () => {
    tauriFsMocks.isTauriVaultRuntime.mockReturnValue(true);
    tauriFsMocks.getTauriVaultRootPath.mockReturnValue('/Users/me/vault');
    tauriMocks.invoke.mockResolvedValue(undefined);
    const syncWithDisk = vi.fn(async () => false);
    let capturedHandler: (() => void) | null = null;
    tauriMocks.listen.mockImplementation(async (_event: string, handler: () => void) => {
      capturedHandler = handler;
      return vi.fn();
    });
    localVaultMocks.useLocalVault.mockReturnValue({
      status: 'loaded',
      handle: fakeHandle(),
      syncWithDisk,
    });

    render(<TauriVaultWatchBridge />);

    await waitFor(() => expect(capturedHandler).not.toBeNull());
    act(() => {
      capturedHandler?.();
    });

    await waitFor(() => expect(syncWithDisk).toHaveBeenCalledTimes(1));
  });

  it('follows the latest sync function without resubscribing while status and root stay', async () => {
    tauriFsMocks.isTauriVaultRuntime.mockReturnValue(true);
    tauriFsMocks.getTauriVaultRootPath.mockReturnValue('/Users/me/vault');
    tauriMocks.invoke.mockResolvedValue(undefined);
    let capturedHandler: (() => void) | null = null;
    tauriMocks.listen.mockImplementation(async (_event: string, handler: () => void) => {
      capturedHandler = handler;
      return vi.fn();
    });
    const firstSync = vi.fn(async () => false);
    const secondSync = vi.fn(async () => false);
    localVaultMocks.useLocalVault.mockReturnValue({
      status: 'loaded',
      handle: fakeHandle(),
      syncWithDisk: firstSync,
    });

    const { rerender } = render(<TauriVaultWatchBridge />);
    await waitFor(() => expect(tauriMocks.listen).toHaveBeenCalledTimes(1));

    // A re-render where only the `syncWithDisk` reference changes while status and handle stay —
    // common after every load(). It must not resubscribe (call listen again).
    localVaultMocks.useLocalVault.mockReturnValue({
      status: 'loaded',
      handle: fakeHandle(),
      syncWithDisk: secondSync,
    });
    rerender(<TauriVaultWatchBridge />);

    expect(tauriMocks.listen).toHaveBeenCalledTimes(1); // no resubscribe

    act(() => {
      capturedHandler?.();
    });
    await waitFor(() => expect(secondSync).toHaveBeenCalledTimes(1));
    expect(firstSync).not.toHaveBeenCalled();
  });

  it('invoke 가 실패해도(권한 거부 등) throw 하지 않는다 — 폴링 fallback 이 계속 커버해야 한다', async () => {
    tauriFsMocks.isTauriVaultRuntime.mockReturnValue(true);
    tauriFsMocks.getTauriVaultRootPath.mockReturnValue('/Users/me/vault');
    tauriMocks.invoke.mockRejectedValue(new Error('permission denied'));
    localVaultMocks.useLocalVault.mockReturnValue({
      status: 'loaded',
      handle: fakeHandle(),
      syncWithDisk: vi.fn(),
    });

    expect(() => render(<TauriVaultWatchBridge />)).not.toThrow();
    await waitFor(() => expect(tauriMocks.invoke).toHaveBeenCalledTimes(1));
    expect(tauriMocks.listen).not.toHaveBeenCalled();
  });
});
