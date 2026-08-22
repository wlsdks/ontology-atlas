import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAppUpdate } from './use-app-update';

/**
 * **The app must not erase, behind the scenes, an answer the user asked for.**
 *
 * Caught by measurement in the pre-launch review, 2026-08-20: pressing "check for updates" in the
 * installed app had the marker catching the result (`failed`) while **that sentence was not on
 * screen.** The cause is the **automatic check** that runs four seconds after mount — the automatic
 * path returns to `idle` to pass a failure over quietly, and that erases the answer the user just
 * received along with it.
 *
 * From the user's side it becomes "I pressed it, something appeared, and it vanished without a word".
 * The opposite of the honesty rule this repository set for degraded cards.
 */

const check = vi.fn();
let desktop = true;

vi.mock('@/shared/lib/desktop-shell', () => ({
  isDesktopShell: () => desktop,
}));

vi.mock('@tauri-apps/plugin-updater', () => ({
  check: (...args: unknown[]) => check(...args),
}));

vi.mock('@tauri-apps/plugin-process', () => ({
  relaunch: vi.fn(),
}));

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  check.mockReset();
  desktop = true;
  window.localStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('직접 누른 확인의 결과', () => {
  it('뒤에서 도는 자동 확인이 그 답을 지우지 않는다', async () => {
    // The endpoint returning 404 — this repository's real state today (zero final releases).
    check.mockRejectedValue(new Error('404'));
    const { result } = renderHook(() => useAppUpdate());

    await act(async () => {
      await result.current.check(true);
    });
    expect(result.current.phase.kind, '직접 누른 확인이 실패를 보고해야 한다').toBe('failed');
    expect(result.current.phase).toMatchObject({ operation: 'check' });

    // The automatic check scheduled four seconds after mount now fires.
    await act(async () => {
      vi.advanceTimersByTime(5_000);
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(
        result.current.phase.kind,
        '자동 확인이 사용자가 받은 답을 지웠다 — 눌렀는데 아무 말 없이 사라진다',
      ).toBe('failed');
    });
  });

  it('설치 단계 실패는 확인 실패와 구분한다', async () => {
    check.mockRejectedValue(new Error('download failed'));
    const { result } = renderHook(() => useAppUpdate());

    await act(async () => {
      await result.current.install();
    });

    expect(result.current.phase).toMatchObject({
      kind: 'failed',
      operation: 'install',
    });
  });

  it('최신이라는 답도 마찬가지로 남는다', async () => {
    check.mockResolvedValue(null);
    const { result } = renderHook(() => useAppUpdate());

    await act(async () => {
      await result.current.check(true);
    });
    expect(result.current.phase.kind).toBe('current');

    await act(async () => {
      vi.advanceTimersByTime(5_000);
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(result.current.phase.kind, '「최신이에요」가 사라졌다').toBe('current');
    });
  });

  it('웹에서는 자동 확인 자체가 없다', async () => {
    desktop = false;
    renderHook(() => useAppUpdate());
    await act(async () => {
      vi.advanceTimersByTime(10_000);
      await Promise.resolve();
    });
    expect(check).not.toHaveBeenCalled();
  });
});
