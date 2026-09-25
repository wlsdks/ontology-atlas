import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { VaultOpenResult } from '@/entities/vault-session';
import { useVaultCreateFlow, type VaultCreateFlowVault } from './use-vault-create-flow';

function makeVault(result: VaultOpenResult): VaultCreateFlowVault & { open: ReturnType<typeof vi.fn> } {
  return { status: 'idle', open: vi.fn(async () => result) };
}

describe('useVaultCreateFlow', () => {
  it('opens the picker once, asking for the starter in the screen language', async () => {
    const vault = makeVault({ opened: true, starterWritten: 12, starterError: null });
    const { result } = renderHook(() => useVaultCreateFlow(vault, 'ko'));

    await act(async () => {
      await result.current.handleCreate({ map: true, wiki: false });
    });

    // One call: the session writes the starter into an empty folder before showing it, and
    // leaves a folder that already holds documents untouched (2026-09-25, D1). Walkthrough
    // 2026-07-26: an argument-less path seeded a Korean screen's vault with English bodies.
    expect(vault.open).toHaveBeenCalledTimes(1);
    expect(vault.open).toHaveBeenCalledWith({
      starter: { locale: 'ko', shape: { map: true, wiki: false } },
    });
    expect(result.current.actionError).toBeNull();
  });

  it('says nothing of its own when the picker is cancelled', async () => {
    const vault = makeVault({ opened: false, starterWritten: 0, starterError: null });
    const starterFailed = vi.fn();
    const { result } = renderHook(() => useVaultCreateFlow(vault, 'ko', { starterFailed }));

    await act(async () => {
      await result.current.handleCreate();
    });

    expect(starterFailed).not.toHaveBeenCalled();
    expect(result.current.actionError).toBeNull();
  });

  it('keeps a starter failure on screen as a code for a host that stays mounted', async () => {
    const vault = makeVault({
      opened: true,
      starterWritten: 0,
      starterError: new Error('Operation not permitted (os error 1)'),
    });
    const { result } = renderHook(() => useVaultCreateFlow(vault, 'ko'));

    await act(async () => {
      await result.current.handleCreate();
    });

    expect(result.current.actionError).toBe('permission-denied');
  });

  it('hands a starter failure to the reporter when the host passes one', async () => {
    const failure = new Error('disk full');
    const vault = makeVault({ opened: true, starterWritten: 3, starterError: failure });
    const starterFailed = vi.fn();
    const { result } = renderHook(() => useVaultCreateFlow(vault, 'ko', { starterFailed }));

    await act(async () => {
      await result.current.handleCreate();
    });

    expect(starterFailed).toHaveBeenCalledWith(failure);
    expect(result.current.actionError).toBeNull();
  });
});
