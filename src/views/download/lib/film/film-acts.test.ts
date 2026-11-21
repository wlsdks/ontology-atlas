import { describe, expect, it } from 'vitest';

import { FADE_MS, FILM_MS, closeUpTravelMs, flight, flightMs, HOLD_MS, seamLight } from './film-acts';
import { easeInOut } from './film-kit';

const CYCLE = FILM_MS + HOLD_MS + FADE_MS;
const FRAME_60 = 1000 / 60;

describe('the loop seam', () => {
  it('is fully dark on both sides of the restart, so no value is seen to jump back', () => {
    expect(seamLight(0, CYCLE)).toBe(0);
    expect(seamLight(CYCLE, CYCLE)).toBe(0);
    expect(seamLight(FILM_MS + HOLD_MS - 1, CYCLE)).toBe(1);
  });

  it('changes the canvas light by less than a quarter in any 60 Hz frame', () => {
    let worst = 0;
    for (let t = 0; t + FRAME_60 <= CYCLE; t += 1) worst = Math.max(worst, Math.abs(seamLight(t + FRAME_60, CYCLE) - seamLight(t, CYCLE)));
    expect(worst).toBeLessThan(0.25);
  });
});

describe('a flight', () => {
  it('moves a mark less than 2.5% of a 1920 stage diagonal in any 60 Hz frame, however far its row', () => {
    const limit = 0.025 * Math.hypot(1920, 960);
    for (const length of [120, 600, 1400, 2200]) {
      const ms = flightMs(length);
      let worst = 0;
      for (let t = 0; t + FRAME_60 <= ms; t += 1) worst = Math.max(worst, (flight(t + FRAME_60, 0, ms).p - flight(t, 0, ms).p) * length);
      expect(worst, `${length}px`).toBeLessThan(limit);
    }
  });

  it('moves a mark less than 2.5% of a smaller stage diagonal too', () => {
    for (const [w, h] of [
      [1280, 720],
      [402, 874],
    ] as const) {
      const diagonal = Math.hypot(w, h);
      for (const length of [120, 600, 1100]) {
        const ms = flightMs(length, diagonal);
        let worst = 0;
        for (let t = 0; t + FRAME_60 <= ms; t += 1) worst = Math.max(worst, (flight(t + FRAME_60, 0, ms).p - flight(t, 0, ms).p) * length);
        expect(worst, `${w} ${length}px`).toBeLessThan(0.025 * diagonal);
      }
    }
  });

  it('keeps the spec\'s 640 ms for a near row and lands exactly', () => {
    expect(flightMs(300)).toBe(640);
    expect(flight(flightMs(1400), 0, flightMs(1400)).p).toBe(1);
  });
});

describe('the close-up travel', () => {
  it('keeps the spec\'s 700 ms for a short way', () => {
    expect(closeUpTravelMs(40, 2000)).toBe(700);
  });

  it('lengthens a far way so no 60 Hz frame moves a mark more than 2.2% of the diagonal at the peak', () => {
    const diagonal = Math.hypot(402, 874);
    for (const farthest of [300, 600, 900]) {
      const ms = closeUpTravelMs(farthest, diagonal);
      let worst = 0;
      for (let t = 0; t + FRAME_60 <= ms; t += 1) worst = Math.max(worst, (easeInOut((t + FRAME_60) / ms) - easeInOut(t / ms)) * farthest);
      expect(worst, `${farthest}px`).toBeLessThanOrEqual(0.022 * diagonal + 1e-9);
    }
  });
});
