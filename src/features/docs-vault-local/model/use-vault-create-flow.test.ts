import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useVaultCreateFlow, type VaultCreateFlowVault } from './use-vault-create-flow';

function makeVault(overrides: Partial<VaultCreateFlowVault> = {}): VaultCreateFlowVault {
  return {
    status: 'idle',
    manifest: null,
    open: vi.fn(async () => undefined),
    scaffoldOntology: vi.fn(async () => ({ created: 8, skipped: 0 })),
    ...overrides,
  };
}

describe('useVaultCreateFlow', () => {
  it('opens the folder picker and does not scaffold before the vault settles', async () => {
    const vault = makeVault();
    const { result } = renderHook(() => useVaultCreateFlow(vault, 'ko'));

    await act(async () => {
      await result.current.handleCreate();
    });

    expect(vault.open).toHaveBeenCalledTimes(1);
    expect(vault.scaffoldOntology).not.toHaveBeenCalled();
  });

  it('scaffolds the starter structure after creating into an empty folder', async () => {
    const vault = makeVault({
      open: vi.fn(async () => {
        vault.status = 'loaded';
        vault.manifest = { docs: [] };
      }),
    });
    const { result, rerender } = renderHook(() => useVaultCreateFlow(vault, 'ko'));

    await act(async () => {
      await result.current.handleCreate();
    });
    rerender();

    await waitFor(() => {
      expect(vault.scaffoldOntology).toHaveBeenCalledTimes(1);
    });
    // 흐름 점검 2026-07-26 D2 — 무인자 호출이 기본 'en' 으로 떨어져, 한국어
    // 화면에서 만든 볼트가 영어 본문으로 시드되던 회귀.
    expect(vault.scaffoldOntology).toHaveBeenCalledWith('ko');
  });

  it('does not scaffold when the chosen folder already has docs', async () => {
    const vault = makeVault({
      open: vi.fn(async () => {
        vault.status = 'loaded';
        vault.manifest = { docs: [{ slug: 'existing' }] };
      }),
    });
    const { result, rerender } = renderHook(() => useVaultCreateFlow(vault, 'ko'));

    await act(async () => {
      await result.current.handleCreate();
    });
    rerender();

    await waitFor(() => {
      expect(vault.open).toHaveBeenCalledTimes(1);
    });
    expect(vault.scaffoldOntology).not.toHaveBeenCalled();
  });

  it('does not scaffold when the picker is cancelled', async () => {
    const vault = makeVault({
      open: vi.fn(async () => {
        vault.status = 'idle';
      }),
    });
    const { result, rerender } = renderHook(() => useVaultCreateFlow(vault, 'ko'));

    await act(async () => {
      await result.current.handleCreate();
    });
    rerender();

    await waitFor(() => {
      expect(vault.open).toHaveBeenCalledTimes(1);
    });
    expect(vault.scaffoldOntology).not.toHaveBeenCalled();
  });
});
