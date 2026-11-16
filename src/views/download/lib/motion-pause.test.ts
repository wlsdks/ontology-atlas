import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { isMotionPaused, setMotionPaused, useMotionPaused } from './motion-pause';

afterEach(() => setMotionPaused(false));

describe('motion pause', () => {
  it('tells every reader at once and remembers the choice in this browser', () => {
    const { result } = renderHook(() => useMotionPaused());
    expect(result.current).toBe(false);
    act(() => setMotionPaused(true));
    expect(result.current).toBe(true);
    expect(isMotionPaused()).toBe(true);
    expect(localStorage.getItem('atlas.download.motion')).toBe('paused');
    act(() => setMotionPaused(false));
    expect(result.current).toBe(false);
    expect(localStorage.getItem('atlas.download.motion')).toBeNull();
  });
});
