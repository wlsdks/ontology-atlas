import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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

function makeVault(overrides: Partial<JustStartVaultVault> = {}): JustStartVaultVault {
  return {
    status: 'idle',
    manifest: null,
    openRecent: vi.fn(async () => undefined),
    scaffoldOntology: vi.fn(async () => ({ created: 8, skipped: 0 })),
    ...overrides,
  };
}

function fakeHandle(name: string): FileSystemDirectoryHandle {
  return { kind: 'directory', name } as unknown as FileSystemDirectoryHandle;
}

describe('useJustStartVault', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates the default folder, connects it, and scaffolds an always-empty new vault', async () => {
    tauriFsMocks.ensureDefaultVaultParentDir.mockResolvedValue(
      '/Users/me/Documents/Ontology Atlas',
    );
    tauriFsMocks.listTauriDirectoryNames.mockResolvedValue([]);
    tauriFsMocks.createTauriVaultHandle.mockReturnValue(fakeHandle('my-ontology'));
    const vault = makeVault({
      openRecent: vi.fn(async () => {
        vault.status = 'loaded';
        vault.manifest = { docs: [] };
      }),
    });
    const { result, rerender } = renderHook(() => useJustStartVault(vault, 'ko'));

    await act(async () => {
      await result.current.justStart();
    });
    rerender();

    expect(tauriFsMocks.ensureTauriChildDirectory).toHaveBeenCalledWith(
      '/Users/me/Documents/Ontology Atlas',
      'my-ontology',
    );
    expect(tauriFsMocks.createTauriVaultHandle).toHaveBeenCalledWith(
      '/Users/me/Documents/Ontology Atlas/my-ontology',
    );
    expect(vault.openRecent).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'current', name: 'my-ontology' }),
    );
    await waitFor(() => {
      expect(vault.scaffoldOntology).toHaveBeenCalledTimes(1);
    });
    // 흐름 점검 2026-07-26 D2 — "그냥 시작하기" 도 화면 언어의 스타터를 만든다.
    expect(vault.scaffoldOntology).toHaveBeenCalledWith('ko');
    expect(result.current.createdPath).toBe('~/Documents/Ontology Atlas/my-ontology');
  });

  it('picks a numbered name when the base folder is already taken', async () => {
    tauriFsMocks.ensureDefaultVaultParentDir.mockResolvedValue(
      '/Users/me/Documents/Ontology Atlas',
    );
    tauriFsMocks.listTauriDirectoryNames.mockResolvedValue(['my-ontology']);
    tauriFsMocks.createTauriVaultHandle.mockReturnValue(fakeHandle('my-ontology-2'));
    const vault = makeVault();
    const { result } = renderHook(() => useJustStartVault(vault, 'ko'));

    await act(async () => {
      await result.current.justStart();
    });

    expect(tauriFsMocks.ensureTauriChildDirectory).toHaveBeenCalledWith(
      '/Users/me/Documents/Ontology Atlas',
      'my-ontology-2',
    );
  });

  it('surfaces an error and does not scaffold when the Tauri runtime is unavailable', async () => {
    tauriFsMocks.ensureDefaultVaultParentDir.mockResolvedValue(null);
    const vault = makeVault();
    const { result } = renderHook(() => useJustStartVault(vault, 'ko'));

    await act(async () => {
      await result.current.justStart();
    });

    expect(result.current.actionError).toBe('Tauri vault runtime is not available.');
    expect(vault.openRecent).not.toHaveBeenCalled();
    expect(vault.scaffoldOntology).not.toHaveBeenCalled();
  });

  it('does not scaffold when connecting the freshly created folder fails', async () => {
    tauriFsMocks.ensureDefaultVaultParentDir.mockResolvedValue(
      '/Users/me/Documents/Ontology Atlas',
    );
    tauriFsMocks.listTauriDirectoryNames.mockResolvedValue([]);
    tauriFsMocks.createTauriVaultHandle.mockReturnValue(fakeHandle('my-ontology'));
    const vault = makeVault({
      openRecent: vi.fn(async () => {
        vault.status = 'error';
      }),
    });
    const { result, rerender } = renderHook(() => useJustStartVault(vault, 'ko'));

    await act(async () => {
      await result.current.justStart();
    });
    rerender();

    expect(vault.scaffoldOntology).not.toHaveBeenCalled();
  });
});
