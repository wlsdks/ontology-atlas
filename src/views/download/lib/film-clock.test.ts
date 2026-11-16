import { describe, expect, it } from 'vitest';

import { createFilmClock } from './film-clock';

const SPANS = [
  [0, 0.25],
  [0.25, 1],
] as const;

describe('createFilmClock', () => {
  it('runs each act over its own span for its own duration, then holds the last frame', () => {
    const clock = createFilmClock(SPANS, [1000, 3000], { holdMs: 500, fadeMs: 200 });
    expect(clock.advance(500)).toBeCloseTo(0.125);
    expect(clock.act()).toBe(0);
    expect(clock.advance(1000)).toBeCloseTo(0.25 + 0.75 / 6);
    expect(clock.act()).toBe(1);
    expect(clock.resting()).toBe(false);
    expect(clock.advance(2600)).toBe(1);
    expect(clock.fade()).toBe(1);
    expect(clock.resting()).toBe(true);
  });

  it('fades out at the end of the hold and starts again from the first act', () => {
    const clock = createFilmClock(SPANS, [1000, 3000], { holdMs: 500, fadeMs: 200 });
    clock.advance(4600);
    expect(clock.fade()).toBeCloseTo(0.5);
    expect(clock.advance(150)).toBeCloseTo(0.0125);
    expect(clock.fade()).toBeCloseTo(0.25);
  });

  it('jumps to an act a visitor picks', () => {
    const clock = createFilmClock(SPANS, [1000, 3000], { holdMs: 500, fadeMs: 200 });
    clock.seek(1);
    expect(clock.progress()).toBeCloseTo(0.25);
    expect(clock.act()).toBe(1);
    expect(clock.fade()).toBe(1);
  });
});
