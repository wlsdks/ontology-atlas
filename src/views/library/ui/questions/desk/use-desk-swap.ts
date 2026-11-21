'use client';

import { useEffect, useState } from 'react';

import { EXIT_WINDOW_MS } from '@/shared/lib/render-timing/use-presence';

/**
 * The slot's children while one value replaces another: the leaving ones first, so each fade continues
 * from the value last drawn. Unlike `useSurfaceSwap` it holds every value still leaving, or asking twice
 * within the exit window unmounts the oldest list mid-fade.
 */
export function useDeskSwap<T extends object>(current: T, reduced: boolean): Array<{ value: T; leaving: boolean }> {
  const [swap, setSwap] = useState<{ current: T; leaving: T[] }>({ current, leaving: [] });
  if (swap.current !== current) {
    setSwap({ current, leaving: reduced ? [] : [...swap.leaving.filter((value) => value !== current), swap.current] });
  }
  useEffect(() => {
    if (!swap.leaving.length) return;
    const id = setTimeout(() => setSwap((state) => (state.leaving.length ? { current: state.current, leaving: [] } : state)), EXIT_WINDOW_MS);
    return () => clearTimeout(id);
  }, [swap]);
  const leaving = swap.current === current ? swap.leaving : [];
  return [...leaving.map((value) => ({ value, leaving: true })), { value: current, leaving: false }];
}
