import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PIXEL_BEAT_MS, onPixelBeat } from './pixel-beat';

describe('onPixelBeat', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // jsdom's window is never the key window; these run at the key window's pace.
    vi.spyOn(document, 'hasFocus').mockReturnValue(true);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('calls each listener as often as it asks on one timer, and sleeps while none needs a beat', () => {
    const every: number[] = [], fourth: number[] = [];
    let beat = 0;
    const counter = onPixelBeat(() => { beat += 1; return 1; });
    const a = onPixelBeat(() => { every.push(beat); return 1; });
    const b = onPixelBeat(() => { fourth.push(beat); return 4; });
    vi.advanceTimersByTime(PIXEL_BEAT_MS * 12 + 1);
    expect(every.length).toBeGreaterThanOrEqual(11);
    expect(fourth.length).toBeLessThanOrEqual(4);
    counter(); a();
    const timers = vi.getTimerCount();
    expect(timers).toBe(1);
    b();
    expect(vi.getTimerCount()).toBe(0);
  });
});
