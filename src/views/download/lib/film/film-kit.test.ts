import { describe, expect, it } from 'vitest';

import { easeInOut, easeOut, LIGHT_STOPS } from './film-kit';

describe('film easing', () => {
  it('starts and ends exactly, so a move hands its last value to the next one', () => {
    for (const ease of [easeInOut, easeOut]) {
      expect(ease(0)).toBe(0);
      expect(ease(1)).toBe(1);
      expect(ease(-0.5)).toBe(0);
      expect(ease(1.5)).toBe(1);
    }
  });

  it('never moves backward and never overshoots', () => {
    for (const ease of [easeInOut, easeOut]) {
      let last = 0;
      for (let i = 1; i <= 200; i += 1) {
        const v = ease(i / 200);
        expect(v).toBeGreaterThanOrEqual(last);
        expect(v).toBeLessThanOrEqual(1);
        last = v;
      }
    }
  });
});

describe('the cluster light', () => {
  it('falls from full at its centre to nothing at its edge without a step', () => {
    expect(LIGHT_STOPS[0]).toEqual([0, 1]);
    expect(LIGHT_STOPS[LIGHT_STOPS.length - 1]![1]).toBe(0);
    for (let i = 1; i < LIGHT_STOPS.length; i += 1) expect(LIGHT_STOPS[i]![1]).toBeLessThan(LIGHT_STOPS[i - 1]![1]);
  });
});
