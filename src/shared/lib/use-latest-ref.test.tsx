import { renderHook } from '@testing-library/react';
import { useCallback } from 'react';
import { describe, expect, it } from 'vitest';

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

