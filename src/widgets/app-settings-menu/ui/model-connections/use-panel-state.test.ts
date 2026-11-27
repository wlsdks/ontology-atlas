import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAnnouncer } from './use-panel-state';

describe('useAnnouncer', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('reads a sentence after a short pause, and only the newest of two quick ones', () => {
    const { result } = renderHook(() => useAnnouncer());
    act(() => {
      result.current.announce('saved');
      result.current.announce('replaced');
    });
    expect(result.current.announcement).toBe('');
    act(() => void vi.advanceTimersByTime(60));
    expect(result.current.announcement).toBe('replaced');
  });

  it('leaves no timer behind when the panel closes while a sentence waits', () => {
    const { result, unmount } = renderHook(() => useAnnouncer());
    act(() => result.current.announce('saved'));
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('starts no timer for a request that finishes after the panel closed', () => {
    const { result, unmount } = renderHook(() => useAnnouncer());
    const { announce } = result.current;
    unmount();
    announce('saved');
    expect(vi.getTimerCount()).toBe(0);
  });
});
