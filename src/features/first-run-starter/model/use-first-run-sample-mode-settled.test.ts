import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  restoreAttempted: true,
  mode: 'static' as 'static' | 'local',
  /** 「한 번이라도 연결했나」 — 비어 있으면 아직 한 번도 안 열어 본 사람. */
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
   * 샘플 안내는 **한 번도 연결 안 해 본 사람**의 것이다 (2026-08-02, 소유자:
   * *"한번이라도 연결했으면 이 샘플은 안나와야하는데?"*).
   *
   * 종전 판정은 「지금 볼트가 열려 있나」뿐이라, 예전에 폴더를 연결했던 사람도
   * 볼트를 닫으면 첫 방문자와 같은 화면을 봤다. 이 케이스가 그 회귀를 막는다.
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
