import { describe, expect, it } from 'vitest';
import { compareCollated } from '../collated-order';
import { findSorted, insertionIndex, patchSorted } from './patch-sorted';

const numeric = (a: number, b: number) => a - b;

describe('insertionIndex', () => {
  it('is the first index whose item sorts after the new one, so equal items stay before it', () => {
    expect(insertionIndex([1, 3, 3, 5], 3, numeric)).toBe(3);
    expect(insertionIndex([1, 3, 5], 0, numeric)).toBe(0);
    expect(insertionIndex([1, 3, 5], 9, numeric)).toBe(3);
    expect(insertionIndex([], 1, numeric)).toBe(0);
  });
});

describe('findSorted', () => {
  it('finds the index of an equal item, or -1', () => {
    expect(findSorted([1, 3, 5, 7], 5, numeric)).toBe(2);
    expect(findSorted([1, 3, 5, 7], 4, numeric)).toBe(-1);
    expect(findSorted([], 4, numeric)).toBe(-1);
  });
});

describe('patchSorted', () => {
  const keyOf = (name: string) => name;
  const patch = (list: string[], remove: string[], add: string[]) =>
    patchSorted(list, new Set(remove), add, keyOf, keyOf, compareCollated);

  /** What a full rebuild produces: the survivors and the additions, sorted again from scratch. */
  const rebuilt = (list: string[], remove: string[], add: string[]) =>
    [...list.filter((name) => !remove.includes(name)), ...add].sort(compareCollated);

  const names = (count: number, from = 0) =>
    Array.from({ length: count }, (_, i) => `n${String(i + from).padStart(4, '0')}`);

  it('removes and inserts a few items so the list stays sorted', () => {
    const list = ['가', '나', 'a', 'b', 'c'].sort(compareCollated);
    expect(patch(list, ['b'], ['다', 'aa'])).toEqual(rebuilt(list, ['b'], ['다', 'aa']));
  });

  it('equals a full re-sort when many items are removed and many added', () => {
    const list = names(200);
    const remove = names(60, 10);
    const add = names(50, 1000).reverse();
    expect(patch(list, remove, add)).toEqual(rebuilt(list, remove, add));
  });

  it('equals a full re-sort at the few-edits limit and one past it', () => {
    const list = names(300);
    for (const count of [32, 33]) {
      const remove = names(count, 40);
      const add = names(count, 5000);
      expect(patch(list, remove, add)).toEqual(rebuilt(list, remove, add));
    }
  });

  it('ignores a removal that is not in the list', () => {
    expect(patch(['a', 'b'], ['zzz'], [])).toEqual(['a', 'b']);
  });

  it('leaves the list it was given untouched', () => {
    const list = ['a', 'b', 'c'];
    patch(list, ['b'], ['d']);
    expect(list).toEqual(['a', 'b', 'c']);
  });
});
