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
    const refCallback = vi.fn();
    const refObject = { current: null as HTMLDivElement | null };
    const node = document.createElement('div');
    mergeRefs(refCallback, refObject)(node);
    expect(refCallback).toHaveBeenCalledWith(node);
    expect(refObject.current).toBe(node);
  });

  it('skips null/undefined refs without throwing', () => {
    const refObject = { current: null as HTMLDivElement | null };
    const node = document.createElement('div');
    expect(() => mergeRefs(null, undefined, refObject)(node)).not.toThrow();
    expect(refObject.current).toBe(node);
  });

  it('propagates null on unmount to every ref', () => {
    const refObject = { current: document.createElement('div') as HTMLDivElement | null };
    mergeRefs(refObject)(null);
    expect(refObject.current).toBeNull();
  });
});
