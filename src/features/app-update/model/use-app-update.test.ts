import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAppUpdate } from './use-app-update';

/**
 * **사용자가 직접 물어본 답을, 앱이 뒤에서 지우면 안 된다.**
 *
 * 2026-08-20 정식 공개 전 검수에서 실측으로 잡혔다: 설치된 앱에서
 * 「업데이트 확인」을 눌렀더니 마커에는 결과(`failed`)가 잡히는데 **화면에는
 * 그 문장이 없었다.** 원인은 마운트 4초 뒤에 도는 **자동 확인**이다 —
 * 자동 경로는 실패를 조용히 넘기려고 `idle` 로 되돌리는데, 그때 사용자가
 * 방금 받은 답까지 같이 지워진다.
 *
 * 사용자 입장에서는 「눌렀더니 뭔가 떴다가 아무 말 없이 사라졌다」가 된다.
 * 이 저장소가 강등 카드에 대해 정해 둔 정직 규율의 반대편이다.
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
    // 엔드포인트가 404 인 상황 — 오늘 이 저장소의 실제 상태다(정식 릴리스 0).
    check.mockRejectedValue(new Error('404'));
    const { result } = renderHook(() => useAppUpdate());

    await act(async () => {
      await result.current.check(true);
    });
    expect(result.current.phase.kind, '직접 누른 확인이 실패를 보고해야 한다').toBe('failed');

    // 마운트 4초 뒤의 예약된 자동 확인이 이제 발화한다.
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
