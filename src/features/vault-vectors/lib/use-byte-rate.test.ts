import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useByteRate } from './use-byte-rate';

describe('the download speed the stage shows', () => {
  let now = 0;
  beforeEach(() => {
    now = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      callback(now);
      return 1;
    });
  });
  afterEach(() => vi.restoreAllMocks());

  const feed = (rerender: (value: number | null) => void, atMs: number, bytes: number | null) => {
    now = atMs;
    act(() => rerender(bytes));
  };

  it('says nothing before three seconds were measured, then bytes per second over them', () => {
    const { result, rerender } = renderHook(({ bytes }: { bytes: number | null }) => useByteRate(bytes), { initialProps: { bytes: 0 } });
    const next = (bytes: number | null) => rerender({ bytes });
    feed(next, 1000, 4_000_000);
    expect(result.current).toBeNull();
    feed(next, 4000, 16_000_000);
    expect(result.current).toBe(4_000_000);
  });

  it('starts over when the count goes back, as a new download does', () => {
    const { result, rerender } = renderHook(({ bytes }: { bytes: number | null }) => useByteRate(bytes), { initialProps: { bytes: 0 } });
    const next = (bytes: number | null) => rerender({ bytes });
    feed(next, 4000, 16_000_000);
    expect(result.current).toBe(4_000_000);
    feed(next, 5000, 1_000);
    expect(result.current).toBeNull();
  });
});
