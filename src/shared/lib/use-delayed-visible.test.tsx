import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SKELETON_DELAY_MS, useDelayedVisible } from './use-presence';

/**
 * **0ms 짜리 일에 로딩 표시를 그리지 않는다** — 이 시험이 지키는 성질.
 *
 * 소유자 제보(2026-08-08): *"문서 선택해서 이동할때 우측 문서화면에 좀 이상하게
 * 회색선이 3개 생겼다가 사라지거든? 거의 1초도 안걸려서 깜빡이다 사라져서"*.
 *
 * 브라우저 실측으로 원인을 확정했다: 문서 8회 전환 전부에서 뷰어의 3줄 스켈레톤이
 * **8.2~15.9ms**(중앙값 9.7ms) 동안 그려졌다 — 60Hz 한 프레임(16.7ms) 안쪽이다.
 * 느린 로딩이 아니라, 부모의 `key={doc.slug}` 리마운트 때문에 본문 상태가 매번
 * null 로 시작하고 프로미스가 다음 틱에 풀리면서 **최소 한 프레임은 스켈레톤이
 * 이기는** 구조였다.
 *
 * 그래서 잠그는 성질은 「빠르면 아예 안 나타난다」와 「느리면 여전히 나타난다」
 * **둘 다**다. 앞만 잠그면 다음 사람이 스켈레톤을 통째로 지워도 초록이고, 뒤만
 * 잠그면 원래 결함이 그대로 통과한다.
 */

function Probe({ active }: { active: boolean }) {
  const visible = useDelayedVisible(active);
  return <span data-testid="state">{visible ? 'visible' : 'hidden'}</span>;
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useDelayedVisible — 기다릴 것이 있을 때만 보인다', () => {
  it('창보다 먼저 끝나면 한 번도 나타나지 않는다', () => {
    const { getByTestId, rerender } = render(<Probe active />);
    expect(getByTestId('state').textContent).toBe('hidden');

    // 실측된 실제 소요(≈10ms)만큼 흐른 뒤 로딩이 끝난다.
    act(() => {
      vi.advanceTimersByTime(10);
    });
    rerender(<Probe active={false} />);

    // 남은 창이 다 지나도 끝까지 안 나타나야 한다 — 타이머가 살아 있으면
    // 여기서 'visible' 이 되고, 그게 소유자가 본 그 깜빡임이다.
    act(() => {
      vi.advanceTimersByTime(SKELETON_DELAY_MS * 2);
    });
    expect(getByTestId('state').textContent).toBe('hidden');
  });

  it('창을 넘겨 오래 걸리면 나타난다 — 진짜 기다림은 여전히 알린다', () => {
    const { getByTestId } = render(<Probe active />);

    act(() => {
      vi.advanceTimersByTime(SKELETON_DELAY_MS - 1);
    });
    expect(getByTestId('state').textContent).toBe('hidden');

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(getByTestId('state').textContent).toBe('visible');
  });

  it('다시 기다리게 되면 창도 다시 시작한다 — 이전 표시가 남아 있지 않다', () => {
    const { getByTestId, rerender } = render(<Probe active />);
    act(() => {
      vi.advanceTimersByTime(SKELETON_DELAY_MS);
    });
    expect(getByTestId('state').textContent).toBe('visible');

    rerender(<Probe active={false} />);
    expect(getByTestId('state').textContent).toBe('hidden');

    rerender(<Probe active />);
    act(() => {
      vi.advanceTimersByTime(SKELETON_DELAY_MS - 1);
    });
    expect(getByTestId('state').textContent).toBe('hidden');
  });

  /**
   * 값이 감각 문턱 아래로 내려가면 이 게이트는 아무것도 안 지킨다 — 한 프레임
   * (16.7ms)보다 큰지, 그리고 「생각의 흐름이 끊긴다」는 1초보다 훨씬 작은지.
   */
  it('창 값이 의미 있는 범위에 있다', () => {
    expect(SKELETON_DELAY_MS).toBeGreaterThan(17);
    expect(SKELETON_DELAY_MS).toBeLessThan(400);
  });
});
