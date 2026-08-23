import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  restoreAttempted: true,
  mode: 'static' as 'static' | 'local',
  /** "Has a vault ever been connected?" — empty means someone who has never opened one. */
  recentVaults: [] as unknown[],
}));

vi.mock('@/features/docs-vault-local', () => ({
  useLocalVault: () => ({
    restoreAttempted: mocks.restoreAttempted,
    recentVaults: mocks.recentVaults,
  }),
}));

vi.mock('@/features/data-source-mode', () => ({
  useDataSourceMode: () => mocks.mode,
}));

import { useFirstRunSampleModeSettled } from './use-first-run-sample-mode-settled';

describe('useFirstRunSampleModeSettled', () => {
  it('is true once restore has settled and no vault is active (static mode)', () => {
    mocks.restoreAttempted = true;
    mocks.mode = 'static';
    const { result } = renderHook(() => useFirstRunSampleModeSettled());
    expect(result.current).toBe(true);
  });

  it('is false while restore is still pending, even in static mode (avoids the flash)', () => {
    mocks.restoreAttempted = false;
    mocks.mode = 'static';
    const { result } = renderHook(() => useFirstRunSampleModeSettled());
    expect(result.current).toBe(false);
  });

  /**
   * The sample guidance is for **someone who has never connected** (2026-08-02, owner:
   * *"If they have connected even once, this sample should not appear?"* — if they connected even once
   * this sample should not appear).
   *
   * The old verdict was only "is a vault open right now", so someone who had connected
   * a folder previously saw the first-time visitor's screen whenever they closed the
   * vault. This case blocks that regression.
   */
  it('연결 이력이 있으면 static 모드여도 샘플 안내를 띄우지 않는다', () => {
    mocks.restoreAttempted = true;
    mocks.mode = 'static';
    mocks.recentVaults = [{ id: 'previously-opened' }];
    const { result } = renderHook(() => useFirstRunSampleModeSettled());
    expect(result.current).toBe(false);
  });

  it('is false once a vault is active (local mode)', () => {
    mocks.restoreAttempted = true;
    mocks.mode = 'local';
    const { result } = renderHook(() => useFirstRunSampleModeSettled());
    expect(result.current).toBe(false);
  });
});
