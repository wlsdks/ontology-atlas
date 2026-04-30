import { describe, expect, it } from 'vitest';
import {
  BOUNCE_AMPLITUDE,
  BOUNCE_DURATION_MS,
  CONTAINER_HOVER_REVEAL_MS,
  computeBounceFactor,
  computeContainerHoverProgress,
  lerp,
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

describe('computeContainerHoverProgress', () => {
  it('returns 0 when hoverStart null', () => {
    expect(computeContainerHoverProgress(null, 1000)).toBe(0);
  });

  it('returns 0 at start (elapsed = 0)', () => {
    expect(computeContainerHoverProgress(1000, 1000)).toBe(0);
  });

  it('returns 1 when elapsed >= revealMs', () => {
    expect(computeContainerHoverProgress(0, CONTAINER_HOVER_REVEAL_MS)).toBe(1);
    expect(computeContainerHoverProgress(0, CONTAINER_HOVER_REVEAL_MS + 50)).toBe(1);
  });

  it('returns 0 when elapsed < 0', () => {
    expect(computeContainerHoverProgress(1000, 999)).toBe(0);
  });

  it('returns easeOutCubic curve at midpoint (>0.5 because curve front-loaded)', () => {
    const mid = computeContainerHoverProgress(0, CONTAINER_HOVER_REVEAL_MS / 2);
    // easeOutCubic at 0.5 = 1 - 0.125 = 0.875
    expect(mid).toBeCloseTo(0.875);
  });

  it('honours custom revealMs', () => {
    const mid = computeContainerHoverProgress(0, 50, 100);
    expect(mid).toBeCloseTo(0.875);
  });
});

describe('lerp', () => {
  it('returns a at progress 0', () => {
    expect(lerp(10, 20, 0)).toBe(10);
  });

  it('returns b at progress 1', () => {
    expect(lerp(10, 20, 1)).toBe(20);
  });

  it('linear interpolation at midpoint', () => {
    expect(lerp(10, 20, 0.5)).toBe(15);
  });

  it('extrapolates beyond [0,1]', () => {
    expect(lerp(0, 10, 1.5)).toBe(15);
    expect(lerp(0, 10, -0.5)).toBe(-5);
  });
});
