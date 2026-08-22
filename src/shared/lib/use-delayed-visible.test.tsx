import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SKELETON_DELAY_MS, useDelayedVisible } from './use-presence';

/**
 * **Never show a loading indicator for work that takes 0ms** — the property this test locks.
 *
 * Owner report (2026-08-08): *"문서 선택해서 이동할때 우측 문서화면에 좀 이상하게 회색선이
 * 3개 생겼다가 사라지거든? 거의 1초도 안걸려서 깜빡이다 사라져서"* (picking a document makes
 * three grey lines flash in the right-hand pane and vanish in well under a second).
 *
 * Measured in the browser: across all 8 document switches, the viewer's three-line skeleton
 * rendered for **8.2–15.9ms** (median 9.7ms) — inside a single 60Hz frame (16.7ms). Not slow
 * loading: the parent's `key={doc.slug}` remount restarts the body state at null every time
 * and the promise resolves on the next tick, so **the skeleton wins at least one frame**
 * structurally.
 *
 * The locked property is therefore **both** "fast work never shows it" and "slow work still
 * does". Locking only the first would stay green if someone deleted the skeleton entirely;
 * locking only the second lets the original defect back through.
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

    // It must stay hidden for the rest of the window. A surviving timer would flip it to
    // 'visible' right here — exactly the flash the owner saw.
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
   * Below the perceptual threshold this gate guards nothing. The window must exceed one frame
   * (16.7ms) and stay well under the 1s at which a train of thought breaks.
   */
  it('창 값이 의미 있는 범위에 있다', () => {
    expect(SKELETON_DELAY_MS).toBeGreaterThan(17);
    expect(SKELETON_DELAY_MS).toBeLessThan(400);
  });
});
