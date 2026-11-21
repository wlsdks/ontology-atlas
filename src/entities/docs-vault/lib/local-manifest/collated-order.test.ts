import { describe, expect, it } from 'vitest';
import { compareCollated } from './collated-order';

describe('compareCollated', () => {
  it('orders Korean names by collation, not by code unit', () => {
    expect(['나', '가', '다'].sort(compareCollated)).toEqual(['가', '나', '다']);
  });

  it('breaks a collator tie by code units, so canonically equal names never compare as equal', () => {
    const precomposed = 'é';
    const decomposed = 'é';
    expect(new Intl.Collator('ko').compare(precomposed, decomposed)).toBe(0);
    expect(compareCollated(precomposed, decomposed)).not.toBe(0);
    expect(compareCollated(precomposed, decomposed)).toBe(-compareCollated(decomposed, precomposed));
  });

  it('gives the same order for any input order of the same names', () => {
    const names = ['b', 'é', 'é', 'a', '가', 'B'];
    const forward = [...names].sort(compareCollated);
    const backward = [...names].reverse().sort(compareCollated);
    expect(backward).toEqual(forward);
  });
});
