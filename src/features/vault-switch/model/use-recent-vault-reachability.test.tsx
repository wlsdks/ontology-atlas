import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LocalFsHandleRecord } from '@/entities/local-fs-handle';

/**
 * **A stored folder's condition is read before the row is pressed, and a rejection is not
 * good news.**
 *
 * The case that matters most is the desktop's: `vault_path_exists` calls `canonical_root`
 * before its own NotFound branch (`src-tauri/src/lib.rs:2702`), and `canonical_root` maps
 * every `canonicalize` failure to `Err` (`src-tauri/src/lib.rs:267`). So a renamed, moved or
 * unmounted folder - the most common stale handle there is, and the one the reachability
 * type exists for - arrives as a **thrown string**, not as `false`. Reported as `unknown`
 * that row stayed pressable and failed on press, which is exactly the outcome the type was
 * built to prevent (workbench seat, 2026-09-13).
 */

const tauri = vi.hoisted(() => ({
  isTauriVaultRuntime: vi.fn(() => true),
  tauriVaultPathExists: vi.fn<(rootPath: string, kind?: string) => Promise<boolean>>(
    async () => true,
  ),
}));
vi.mock('@/shared/lib/tauri-vault-fs', () => tauri);

vi.mock('@/entities/local-fs-handle', () => ({
  verifyHandlePermission: vi.fn(async () => 'granted' as const),
}));

import { useRecentVaultReachability } from './use-recent-vault-reachability';

function record(name: string): LocalFsHandleRecord {
  const rootPath = `/Users/dana/vaults/${name}`;
  return {
    id: 'current',
    handle: { kind: 'directory', name, rootPath } as unknown as FileSystemDirectoryHandle,
    desktopRootPath: rootPath,
    name,
    createdAt: 1,
    lastAccessedAt: 1,
  };
}

afterEach(() => {
  vi.clearAllMocks();
  tauri.isTauriVaultRuntime.mockReturnValue(true);
});

describe('useRecentVaultReachability on the desktop', () => {
  it('reports a folder whose path resolves as ready', async () => {
    tauri.tauriVaultPathExists.mockResolvedValue(true);
    const records = [record('atlas')];
    const hook = renderHook(() => useRecentVaultReachability(records));

    await waitFor(() =>
      expect(hook.result.current['/Users/dana/vaults/atlas']).toBe('ready'),
    );
  });

  it('reports a folder whose path answers false as missing', async () => {
    tauri.tauriVaultPathExists.mockResolvedValue(false);
    const records = [record('gone')];
    const hook = renderHook(() => useRecentVaultReachability(records));

    await waitFor(() => expect(hook.result.current['/Users/dana/vaults/gone']).toBe('missing'));
  });

  it('reads a not-found rejection as missing rather than unknown', async () => {
    // The real shape from Tauri: a `#[command]` returning `Err(String)` rejects with a
    // plain string, not an Error. `isMissingFolderError` recognises both this signature and
    // the browser's `NotFoundError`, so one classifier answers for both runtimes.
    tauri.tauriVaultPathExists.mockRejectedValue(
      'No such file or directory (os error 2)',
    );
    const records = [record('renamed')];
    const hook = renderHook(() => useRecentVaultReachability(records));

    await waitFor(() =>
      expect(hook.result.current['/Users/dana/vaults/renamed']).toBe('missing'),
    );
  });

  it('still reports an unrecognised rejection as unknown, never as ready', async () => {
    // Absence of a recognised signature is not proof the folder is fine. `unknown` keeps the
    // row pressable and makes it say the condition could not be read.
    tauri.tauriVaultPathExists.mockRejectedValue('permission denied by the operating system');
    const records = [record('walled')];
    const hook = renderHook(() => useRecentVaultReachability(records));

    await waitFor(() =>
      expect(hook.result.current['/Users/dana/vaults/walled']).toBe('unknown'),
    );
  });
});
