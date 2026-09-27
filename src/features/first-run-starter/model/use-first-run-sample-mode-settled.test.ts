import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  restoreAttempted: true,
  mode: 'static' as 'static' | 'local',
  /** Empty means someone who never opened a vault. */
  recentVaults: [] as unknown[],
}));

vi.mock('@/entities/vault-session/model/LocalVaultProvider', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/entities/vault-session/model/LocalVaultProvider')>()),
  useLocalVault: () => ({
    restoreAttempted: mocks.restoreAttempted,
    recentVaults: mocks.recentVaults,
  }),
}));
vi.mock('@/entities/vault-session/model/use-data-source-mode', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/entities/vault-session/model/use-data-source-mode')>()),
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

  /** Sample guidance is only for someone who has never connected, even while no vault is open. */
  it('does not show the sample hint in static mode when a connection history exists', () => {
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
