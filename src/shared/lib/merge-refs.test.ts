import { describe, expect, it, vi } from 'vitest';

import { mergeRefs } from './merge-refs';

describe('mergeRefs', () => {
  it('sets every ref object to the same node', () => {
    const a = { current: null as HTMLDivElement | null };
    const b = { current: null as HTMLDivElement | null };
    const node = document.createElement('div');
    mergeRefs(a, b)(node);
    expect(a.current).toBe(node);
    expect(b.current).toBe(node);
  });

  it('calls every function ref with the same node', () => {
    const fnA = vi.fn();
    const fnB = vi.fn();
    const node = document.createElement('div');
    mergeRefs(fnA, fnB)(node);
    expect(fnA).toHaveBeenCalledWith(node);
    expect(fnB).toHaveBeenCalledWith(node);
  });

  it('mixes function and object refs', () => {
    const fn = vi.fn();
    const obj = { current: null as HTMLDivElement | null };
    const node = document.createElement('div');
    mergeRefs(fn, obj)(node);
    expect(fn).toHaveBeenCalledWith(node);
    expect(obj.current).toBe(node);
  });

  it('skips null/undefined refs without throwing', () => {
    const obj = { current: null as HTMLDivElement | null };
    const node = document.createElement('div');
    expect(() => mergeRefs(null, undefined, obj)(node)).not.toThrow();
    expect(obj.current).toBe(node);
  });

  it('propagates null on unmount to every ref', () => {
    const obj = { current: document.createElement('div') as HTMLDivElement | null };
    mergeRefs(obj)(null);
    expect(obj.current).toBeNull();
  });
});
