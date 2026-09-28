import { describe, expect, it } from 'vitest';
import { cubicBezierAt, easeMotion } from './ease';
import { MOTION_EASE } from './tokens';

const CSS_EASE = [0.25, 0.1, 0.25, 1] as const;

function sampleParametric(curve: readonly [number, number, number, number], t: number) {
  const [x1, y1, x2, y2] = curve;
  const u = 1 - t;
  const at = (p1: number, p2: number) => 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t;
  return { x: at(x1, x2), y: at(y1, y2) };
}

describe('easeMotion', () => {
  it('is the --motion-ease curve', () => {
    expect(MOTION_EASE).toEqual(CSS_EASE);
  });

  it('matches the CSS ease bezier within 1e-3 across the whole curve', () => {
    for (let i = 0; i <= 200; i += 1) {
      const point = sampleParametric(CSS_EASE, i / 200);
      expect(Math.abs(easeMotion(point.x) - point.y)).toBeLessThan(1e-3);
    }
  });

  it('pins the ends and never runs backwards', () => {
    expect(easeMotion(0)).toBe(0);
    expect(easeMotion(1)).toBe(1);
    expect(easeMotion(-0.5)).toBe(0);
    expect(easeMotion(1.5)).toBe(1);
    let previous = 0;
    for (let i = 1; i <= 100; i += 1) {
      const next = easeMotion(i / 100);
      expect(next).toBeGreaterThanOrEqual(previous);
      previous = next;
    }
  });

  it('decelerates: the first half covers more than half the distance', () => {
    expect(easeMotion(0.5)).toBeGreaterThan(0.5);
  });

  it('solves other curves, including a steep one', () => {
    const steep = [0.9, 0, 0.1, 1] as const;
    for (let i = 0; i <= 50; i += 1) {
      const point = sampleParametric(steep, i / 50);
      expect(Math.abs(cubicBezierAt(steep, point.x) - point.y)).toBeLessThan(1e-3);
    }
  });
});
