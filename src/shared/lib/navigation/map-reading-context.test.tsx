import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useMapReadingContext } from './map-reading-context';

describe('map reading context', () => {
  it('retains selection and search across route remounts for the same folder', () => {
    const scope = {};
    const first = renderHook(() => useMapReadingContext(scope));
    act(() => {
      first.result.current.select('capability:settlement');
      first.result.current.search('settle');
    });
    first.unmount();
    const next = renderHook(() => useMapReadingContext(scope));
    expect(next.result.current.selectedId).toBe('capability:settlement');
    expect(next.result.current.query).toBe('settle');
  });

  it('keeps same-name folders and writes from an older folder separate', () => {
    const firstScope = { name: 'ontology' };
    const secondScope = { name: 'ontology' };
    const old = renderHook(() => useMapReadingContext(firstScope));
    const current = renderHook(() => useMapReadingContext(secondScope));
    act(() => {
      current.result.current.select('domain:payments');
      old.result.current.select('domain:orders');
      old.result.current.search('orders');
    });
    expect(current.result.current.selectedId).toBe('domain:payments');
    expect(current.result.current.query).toBe('');
  });

  it('shares live edits and intentional clearing with navigation consumers', () => {
    const scope = {};
    const map = renderHook(() => useMapReadingContext(scope));
    const navigation = renderHook(() => useMapReadingContext(scope));
    act(() => {
      map.result.current.select('domain:payments');
      map.result.current.search('payments');
    });
    expect(navigation.result.current.selectedId).toBe('domain:payments');
    act(() => {
      map.result.current.select(null);
      map.result.current.search('');
    });
    expect(navigation.result.current.selectedId).toBeNull();
    expect(navigation.result.current.query).toBe('');
  });

  it('does not recover another unscoped view', () => {
    const first = renderHook(() => useMapReadingContext(null));
    act(() => first.result.current.search('private search'));
    first.unmount();
    const next = renderHook(() => useMapReadingContext(null));
    expect(next.result.current.query).toBe('');
  });
});
