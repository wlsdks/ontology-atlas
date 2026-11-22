import { describe, expect, it } from 'vitest';

import { DEG, angleGap, normalizeAngle } from './film-geometry';

describe('angles', () => {
  it('folds any angle into one turn', () => {
    expect(normalizeAngle(-90 * DEG)).toBeCloseTo(270 * DEG);
    expect(normalizeAngle(450 * DEG)).toBeCloseTo(90 * DEG);
    expect(normalizeAngle(0)).toBe(0);
  });

  it('measures the shorter way around between two directions', () => {
    expect(angleGap(10 * DEG, 350 * DEG)).toBeCloseTo(20 * DEG);
    expect(angleGap(350 * DEG, 10 * DEG)).toBeCloseTo(20 * DEG);
    expect(angleGap(0, Math.PI)).toBeCloseTo(Math.PI);
  });
});
