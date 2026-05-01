import { describe, expect, it } from 'vitest';
import {
  BOUNCE_AMPLITUDE,
  BOUNCE_DURATION_MS,
  computeBounceFactor,
} from './reducer-anim';

describe('computeBounceFactor', () => {
  it('returns 1 when bounceStart is null', () => {
    expect(computeBounceFactor(null, 1000)).toBe(1);
  });

  it('returns 1 when elapsed >= duration', () => {
    expect(computeBounceFactor(0, BOUNCE_DURATION_MS)).toBe(1);
    expect(computeBounceFactor(0, BOUNCE_DURATION_MS + 100)).toBe(1);
  });

  it('returns 1 when now < bounceStart (negative elapsed)', () => {
    expect(computeBounceFactor(1000, 999)).toBe(1);
  });

  it('peaks at 1 + amplitude at half duration', () => {
    const peak = computeBounceFactor(0, BOUNCE_DURATION_MS / 2);
    expect(peak).toBeCloseTo(1 + BOUNCE_AMPLITUDE);
  });

  it('returns 1 at start (phase = 0, sin(0) = 0)', () => {
    expect(computeBounceFactor(1000, 1000)).toBe(1);
  });

  it('honours custom duration / amplitude', () => {
    const peak = computeBounceFactor(0, 100, 200, 0.5);
    expect(peak).toBeCloseTo(1.5);
  });
});

