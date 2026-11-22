import { describe, expect, it } from 'vitest';
import { stableOrder } from './use-stable-order';

describe('stableOrder', () => {
  it('keeps every element where it first stood when the plan reorders them, and adds new ones last', () => {
    expect(stableOrder(['a', 'b', 'c'], ['c', 'a', 'd', 'b'])).toEqual(['a', 'b', 'c', 'd']);
  });

  it('drops keys that left and returns the same list when nothing changed', () => {
    const order = ['a', 'b', 'c'];
    expect(stableOrder(order, ['c', 'a'])).toEqual(['a', 'c']);
    expect(stableOrder(order, ['b', 'c', 'a'])).toBe(order);
  });
});
