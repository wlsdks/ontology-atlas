import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  restoreAttempted: true,
  mode: 'static' as 'static' | 'local',
}));

vi.mock('@/features/docs-vault-local', () => ({
  useLocalVault: () => ({ restoreAttempted: mocks.restoreAttempted }),
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

  it('is false once a vault is active (local mode)', () => {
    mocks.restoreAttempted = true;
    mocks.mode = 'local';
    const { result } = renderHook(() => useFirstRunSampleModeSettled());
    expect(result.current).toBe(false);
  });
});
