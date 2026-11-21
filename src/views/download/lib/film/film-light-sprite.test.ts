import { describe, expect, it } from 'vitest';

import { LIGHT_STOPS } from './film-light-sprite';

describe('the cluster light', () => {
  it('falls from full at its centre to nothing at its edge without a step', () => {
    expect(LIGHT_STOPS[0]).toEqual([0, 1]);
    expect(LIGHT_STOPS[LIGHT_STOPS.length - 1]![1]).toBe(0);
    for (let i = 1; i < LIGHT_STOPS.length; i += 1) expect(LIGHT_STOPS[i]![1]).toBeLessThan(LIGHT_STOPS[i - 1]![1]);
  });
});
