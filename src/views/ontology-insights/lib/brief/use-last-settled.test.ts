import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useLastSettled } from './use-last-settled';

const first = { stale: 142, unknown: 101 };
const second = { stale: 140, unknown: 101 };

describe('useLastSettled', () => {
  it('has nothing to show before the first count lands', () => {
    const { result } = renderHook(() => useLastSettled<typeof first>(null, 'vault-a'));
    expect(result.current).toBeNull();
  });

  it('keeps the settled value while a recount runs, then takes the new one', () => {
    const { result, rerender } = renderHook(({ value, scope }) => useLastSettled(value, scope), {
      initialProps: { value: first as typeof first | null, scope: 'vault-a' },
    });
    expect(result.current).toBe(first);
    // A watcher reload restarts the Git walk: the live value is null for a moment.
    rerender({ value: null, scope: 'vault-a' });
    expect(result.current).toBe(first);
    rerender({ value: second, scope: 'vault-a' });
    expect(result.current).toBe(second);
    rerender({ value: null, scope: 'vault-a' });
    expect(result.current).toBe(second);
  });

  it('never answers one folder or visit with another one\'s count', () => {
    const { result, rerender } = renderHook(({ value, scope }) => useLastSettled(value, scope), {
      initialProps: { value: first as typeof first | null, scope: 'vault-a' },
    });
    rerender({ value: null, scope: 'vault-b' });
    expect(result.current).toBeNull();
    // Coming back to the first folder does not resurrect what it showed before the switch: the
    // files may have moved while another folder was open.
    rerender({ value: null, scope: 'vault-a' });
    expect(result.current).toBeNull();
  });

  it('drops the count when the visit is marked during a recount', () => {
    const { result, rerender } = renderHook(({ value, scope }) => useLastSettled(value, scope), {
      initialProps: { value: first as typeof first | null, scope: 'vault-a\0' },
    });
    rerender({ value: null, scope: 'vault-a\u00001790000000000' });
    expect(result.current).toBeNull();
  });
});
