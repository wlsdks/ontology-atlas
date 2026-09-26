import { act, renderHook, waitFor } from '@testing-library/react';
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
      expect(hook.result.current?.['/Users/dana/vaults/atlas']).toBe('ready'),
    );
  });

  it('reports a folder whose path answers false as missing', async () => {
    tauri.tauriVaultPathExists.mockResolvedValue(false);
    const records = [record('gone')];
    const hook = renderHook(() => useRecentVaultReachability(records));

    await waitFor(() => expect(hook.result.current?.['/Users/dana/vaults/gone']).toBe('missing'));
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
      expect(hook.result.current?.['/Users/dana/vaults/renamed']).toBe('missing'),
    );
  });

  it('still reports an unrecognised rejection as unknown, never as ready', async () => {
    // Absence of a recognised signature is not proof the folder is fine. `unknown` keeps the
    // row pressable and makes it say the condition could not be read.
    tauri.tauriVaultPathExists.mockRejectedValue('permission denied by the operating system');
    const records = [record('walled')];
    const hook = renderHook(() => useRecentVaultReachability(records));

    await waitFor(() =>
      expect(hook.result.current?.['/Users/dana/vaults/walled']).toBe('unknown'),
    );
  });
});

/**
 * **The list is drawn once, from answers** (2026-09-26). Before the probe answered, every row
 * was drawn `unknown` and redrawn a frame later; once missing folders fold into one line, that
 * first frame would be a different shape as well — five rows collapsing to two and a line.
 */
describe('useRecentVaultReachability draws from the first answer', () => {
  it('is null until the probe answers', async () => {
    let answer: (exists: boolean) => void = () => undefined;
    tauri.tauriVaultPathExists.mockImplementation(
      () => new Promise<boolean>((resolve) => { answer = resolve; }),
    );
    const records = [record('atlas')];
    const hook = renderHook(() => useRecentVaultReachability(records));

    expect(hook.result.current).toBeNull();
    answer(false);
    await waitFor(() => expect(hook.result.current).toEqual({ '/Users/dana/vaults/atlas': 'missing' }));
  });

  it('draws past the deadline when one folder never answers, and takes its answer later', async () => {
    vi.useFakeTimers();
    try {
      let late: (exists: boolean) => void = () => undefined;
      tauri.tauriVaultPathExists.mockImplementation(async (rootPath: string) =>
        rootPath.endsWith('/stalled') ? new Promise<boolean>((resolve) => { late = resolve; }) : true,
      );
      const records = [record('atlas'), record('stalled')];
      const hook = renderHook(() => useRecentVaultReachability(records));

      await act(() => vi.advanceTimersByTimeAsync(100));
      expect(hook.result.current).toBeNull();
      await act(() => vi.advanceTimersByTimeAsync(400));
      // Drawn: the answered folder is ready, the stalled one has no answer (the row reads `unknown`).
      expect(hook.result.current).toEqual({ '/Users/dana/vaults/atlas': 'ready' });

      await act(async () => {
        late(false);
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(hook.result.current).toEqual({
        '/Users/dana/vaults/atlas': 'ready',
        '/Users/dana/vaults/stalled': 'missing',
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('never goes back to null while the list changes under it', async () => {
    tauri.tauriVaultPathExists.mockResolvedValue(true);
    let records = [record('atlas'), record('notes')];
    const hook = renderHook(() => useRecentVaultReachability(records));
    await waitFor(() => expect(hook.result.current?.['/Users/dana/vaults/notes']).toBe('ready'));

    // Forgetting a folder re-probes the rest; the list must stay drawn meanwhile.
    tauri.tauriVaultPathExists.mockImplementation(() => new Promise<boolean>(() => undefined));
    records = [record('atlas')];
    hook.rerender();
    expect(hook.result.current).not.toBeNull();
    expect(hook.result.current?.['/Users/dana/vaults/atlas']).toBe('ready');
  });
});
