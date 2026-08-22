import { render, screen, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FrameMeter } from './frame-meter';
import { writeFrameMeter } from '@/shared/lib/appearance-preferences';

/**
 * The value of this instrument is not "numbers appear when it is on" but
 * **"it does not exist while it is off"**. A diagnostic that slows down what it
 * diagnoses ends up measuring itself, which is worse than having none. That
 * promise is pinned here rather than left in a comment.
 */
describe('FrameMeter', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  it('꺼져 있으면 rAF 를 한 번도 걸지 않는다', () => {
    const raf = vi.spyOn(window, 'requestAnimationFrame');
    render(<FrameMeter />);
    expect(raf).not.toHaveBeenCalled();
  });

  it('꺼져 있으면 아무것도 렌더하지 않는다', () => {
    const { container } = render(<FrameMeter />);
    expect(container).toBeEmptyDOMElement();
  });

  it('켜면 측정 루프가 돈다', () => {
    const raf = vi.spyOn(window, 'requestAnimationFrame');
    act(() => {
      writeFrameMeter(true);
    });
    render(<FrameMeter />);
    expect(raf).toHaveBeenCalled();
  });

  it('껐다 켜는 것이 저장되고 되읽힌다', () => {
    act(() => {
      writeFrameMeter(true);
    });
    const { rerender } = render(<FrameMeter />);
    rerender(<FrameMeter />);
    act(() => {
      writeFrameMeter(false);
    });
    // Switching back to off removes the display — the stored value is the screen.
    expect(screen.queryByText(/fps/)).toBeNull();
  });

  it('켜져 있어도 첫 표본이 모이기 전에는 숫자를 지어내지 않는다', () => {
    act(() => {
      writeFrameMeter(true);
    });
    // rAF has not run twice yet, so no interval can be computed — and a plausible
    // lie such as "0fps" must not be drawn in its place.
    const { container } = render(<FrameMeter />);
    expect(container.textContent).not.toContain('fps');
  });
});
