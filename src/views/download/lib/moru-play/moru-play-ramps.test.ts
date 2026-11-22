import { describe, expect, it } from 'vitest';

import {
  TOAST_MS,
  bubbleOpacity,
  countdownDigit,
  countdownOpacity,
  countdownSize,
  pulseScale,
  scoreFloatOpacity,
  scoreFloatRise,
  scoreFloatSize,
  tierBadgeOpacity,
  toastOpacity,
} from './moru-play-ramps';

describe('the power toast', () => {
  it('is hidden before it is shown and after it ends', () => {
    expect(toastOpacity(-1)).toBe(0);
    expect(toastOpacity(Infinity)).toBe(0);
    expect(toastOpacity(TOAST_MS + 1)).toBe(0);
  });

  it('fades in over 160 ms, holds, and fades out over the last 300 ms', () => {
    expect(toastOpacity(0)).toBe(0);
    expect(toastOpacity(80)).toBeGreaterThan(0.3);
    expect(toastOpacity(80)).toBeLessThan(0.7);
    expect(toastOpacity(130)).toBeLessThan(1);
    expect(toastOpacity(160)).toBe(1);
    expect(toastOpacity(TOAST_MS - 300)).toBe(1);
    expect(toastOpacity(TOAST_MS - 150)).toBeGreaterThan(0);
    expect(toastOpacity(TOAST_MS - 150)).toBeLessThan(1);
  });
});

describe('a pulse', () => {
  it('starts and ends at rest, swells by its gain in between, and stays at rest after', () => {
    expect(pulseScale(0, 420, 0.45)).toBe(1);
    expect(pulseScale(420, 420, 0.45)).toBe(1);
    expect(pulseScale(Infinity, 420, 0.45)).toBe(1);
    const swell = Math.max(...Array.from({ length: 41 }, (_, i) => pulseScale(i * 10, 420, 0.45)));
    expect(swell).toBeGreaterThan(1.3);
    expect(swell).toBeLessThanOrEqual(1.45);
  });
});

describe('the countdown', () => {
  it('shows 3, 2, 1 across three seconds and nothing after', () => {
    expect([0, 999, 1000, 2000, 2999].map(countdownDigit)).toEqual([3, 3, 2, 1, 1]);
    expect(countdownDigit(3000)).toBe(0);
  });

  it('fades each digit in over 80 ms and out over the last 240 ms of its second', () => {
    expect(countdownOpacity(0)).toBe(0);
    expect(countdownOpacity(80)).toBe(1);
    expect(countdownOpacity(760)).toBe(1);
    expect(countdownOpacity(880)).toBeGreaterThan(0);
    expect(countdownOpacity(880)).toBeLessThan(1);
    expect(countdownOpacity(1000)).toBe(0);
  });

  it('pops in large and settles, and stays at size 1 under reduced motion', () => {
    expect(countdownSize(0, false)).toBeGreaterThan(1.3);
    expect(countdownSize(900, false)).toBeCloseTo(1, 1);
    expect(countdownSize(0, true)).toBe(1);
  });
});

describe('the score that floats up', () => {
  it('rises 38 px and stands still under reduced motion', () => {
    expect(scoreFloatRise(520, false)).toBe(38);
    expect(scoreFloatRise(520, true)).toBe(0);
  });

  it('fades in over 80 ms, holds, and is gone by 740 ms', () => {
    expect(scoreFloatOpacity(0)).toBe(0);
    expect(scoreFloatOpacity(80)).toBe(1);
    expect(scoreFloatOpacity(480)).toBe(1);
    expect(scoreFloatOpacity(740)).toBe(0);
  });

  it('grows from 0.7 to full size, or stays full under reduced motion', () => {
    expect(scoreFloatSize(0, false)).toBeCloseTo(0.7);
    expect(scoreFloatSize(260, false)).toBeCloseTo(1, 1);
    expect(scoreFloatSize(0, true)).toBe(1);
  });
});

describe('the badges over Moru', () => {
  it('shows the tier badge for 900 ms', () => {
    expect(tierBadgeOpacity(0)).toBe(0);
    expect(tierBadgeOpacity(120)).toBe(1);
    expect(tierBadgeOpacity(900)).toBe(0);
  });

  it('shows the golden-star bubble for 900 ms', () => {
    expect(bubbleOpacity(0)).toBe(0);
    expect(bubbleOpacity(90)).toBe(1);
    expect(bubbleOpacity(900)).toBe(0);
  });
});
