import { render, screen, act } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FrameMeter } from './frame-meter';
import { writeFrameMeter } from '@/shared/lib/appearance-preferences';
import en from '../../../messages/en.json';
import ko from '../../../messages/ko.json';

function renderMeter(locale: 'en' | 'ko' = 'en') {
  return render(
    <NextIntlClientProvider locale={locale} messages={locale === 'en' ? en : ko}>
      <FrameMeter />
    </NextIntlClientProvider>,
  );
}

/**
 * Takes the meter's clock and frame loop into the test's hands, so a reading can be produced
 * deterministically: `tick(at)` delivers the next animation frame at `at` ms.
 */
function takeFrameLoop() {
  const frames: FrameRequestCallback[] = [];
  vi.spyOn(performance, 'now').mockReturnValue(1000);
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    frames.push(callback);
    return frames.length;
  });
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);
  return (at: number) =>
    act(() => {
      frames.shift()?.(at);
    });
}

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
    renderMeter();
    expect(raf).not.toHaveBeenCalled();
  });

  it('꺼져 있으면 아무것도 렌더하지 않는다', () => {
    const { container } = renderMeter();
    expect(container).toBeEmptyDOMElement();
  });

  it('켜면 측정 루프가 돈다', () => {
    const raf = vi.spyOn(window, 'requestAnimationFrame');
    act(() => {
      writeFrameMeter(true);
    });
    renderMeter();
    expect(raf).toHaveBeenCalled();
  });

  it('껐다 켜는 것이 저장되고 되읽힌다', () => {
    act(() => {
      writeFrameMeter(true);
    });
    const { rerender } = renderMeter();
    rerender(
      <NextIntlClientProvider locale="en" messages={en}>
        <FrameMeter />
      </NextIntlClientProvider>,
    );
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
    const { container } = renderMeter();
    expect(container.textContent).not.toContain('fps');
  });

  /*
   * Inspection 2026-09-25 (D2): the readout printed "worst" and "dropped" as Korean literals
   * beside an English "fps", so an English screen read a sentence in two languages and a Korean
   * one did too. Every word of the reading is the screen's language.
   */
  it('영어 화면에서는 읽음값이 전부 영어다', () => {
    act(() => {
      writeFrameMeter(true);
    });
    const tick = takeFrameLoop();
    const { container } = renderMeter('en');
    tick(1016);
    tick(1300); // one 284 ms stall: 2 frames in 300 ms is 7 fps, and one frame dropped

    expect(container.textContent).toContain('7 fps');
    expect(container.textContent).toContain('worst 284 ms');
    expect(container.textContent).toContain('1 dropped');
    expect(container.textContent).not.toMatch(/\p{Script=Hangul}/u);
  });

  it('한국어 화면에서는 읽음값이 전부 한국어다', () => {
    act(() => {
      writeFrameMeter(true);
    });
    const tick = takeFrameLoop();
    const { container } = renderMeter('ko');
    tick(1016);
    tick(1300);

    expect(container.textContent).toContain('초당 7프레임');
    expect(container.textContent).toContain('최악 284ms');
    expect(container.textContent).toContain('끊김 1번');
    expect(container.textContent).not.toMatch(/fps|worst|dropped/i);
  });
});
