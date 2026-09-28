import { describe, expect, it } from 'vitest';

import { stringHash } from './string-hash';

describe('stringHash', () => {
  it('is stable for equal text and differs for a change anywhere', () => {
    const long = `${'a'.repeat(100_000)}b`;
    expect(stringHash(long)).toBe(stringHash(`${'a'.repeat(100_000)}b`));
    expect(stringHash(long)).not.toBe(stringHash(`${'a'.repeat(100_000)}c`));
    expect(stringHash('ab')).not.toBe(stringHash('ba'));
  });

  it('tells apart texts that differ only in one UTF-16 unit of a Hangul syllable', () => {
    expect(stringHash('가')).not.toBe(stringHash('각'));
  });
});
