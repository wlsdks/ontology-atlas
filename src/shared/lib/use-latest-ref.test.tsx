import { renderHook } from '@testing-library/react';
import { useCallback } from 'react';
import { describe, expect, it } from 'vitest';

import { useDerived } from './use-derived';
import { useLatestRef } from './use-latest-ref';

describe('useLatestRef', () => {
  it('lets a callback made on the first render read the latest committed value', () => {
    const { result, rerender } = renderHook(({ value }) => {
      const ref = useLatestRef(value);
      return useCallback(() => ref.current, [ref]);
    }, { initialProps: { value: 'first' } });
    const read = result.current;
    rerender({ value: 'second' });
    expect(result.current).toBe(read);
    expect(read()).toBe('second');
  });
});

describe('useDerived', () => {
  const pair = (a: string, b: string) => ({ joined: `${a}+${b}` });

  it('derives again only when an argument changes', () => {
    const { result, rerender } = renderHook(({ a, b }) => useDerived(pair, a, b), {
      initialProps: { a: 'x', b: 'y' },
    });
    const first = result.current;
    rerender({ a: 'x', b: 'y' });
    expect(result.current).toBe(first);
    rerender({ a: 'x', b: 'z' });
    expect(result.current).toEqual({ joined: 'x+z' });
  });
});
