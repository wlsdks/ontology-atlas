import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useGuideClock } from './use-guide-clock';

let observed: ((entries: { isIntersecting: boolean }[]) => void) | null = null;

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('IntersectionObserver', class {
    constructor(callback: (entries: { isIntersecting: boolean }[]) => void) { observed = callback; }
    observe() { observed?.([{ isIntersecting: true }]); }
    disconnect() { observed = null; }
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const element = { current: document.createElement('div') };

describe('useGuideClock', () => {
  it('advances by the time that passed, tick after tick', () => {
    const { result } = renderHook(() => useGuideClock(element, true, 60_000));
    act(() => { vi.advanceTimersByTime(3000); });
    expect(result.current).toBeGreaterThanOrEqual(2900);
    expect(result.current).toBeLessThanOrEqual(3000);
  });

  it('keeps its place while not playing and while off screen', () => {
    const { result, rerender } = renderHook(({ playing }) => useGuideClock(element, playing, 60_000), { initialProps: { playing: true } });
    act(() => { vi.advanceTimersByTime(1000); });
    const paused = result.current;
    rerender({ playing: false });
    act(() => { vi.advanceTimersByTime(5000); });
    expect(result.current).toBe(paused);
    rerender({ playing: true });
    act(() => { observed?.([{ isIntersecting: false }]); });
    act(() => { vi.advanceTimersByTime(5000); });
    expect(result.current).toBe(paused);
  });

  it('wraps at the loop length', () => {
    const { result } = renderHook(() => useGuideClock(element, true, 1000));
    act(() => { vi.advanceTimersByTime(2550); });
    expect(result.current).toBeLessThan(1000);
  });
});
