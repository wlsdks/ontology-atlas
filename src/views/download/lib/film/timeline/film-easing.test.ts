import { describe, expect, it } from 'vitest';

import { easeInOut, easeOut } from './film-easing';

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
