import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SKELETON_DELAY_MS, useDelayedVisible } from './use-presence';

/**
 * Fast work must never show the loading indicator, and slow work still must; locking only one side
 * would let the other regress.
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

    // Loading finishes after the measured real duration (~10ms).
    act(() => {
      vi.advanceTimersByTime(10);
    });
    rerender(<Probe active={false} />);

    // A surviving timer would flip it to visible here.
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
});
