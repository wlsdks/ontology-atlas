import { describe, expect, it } from 'vitest';

import {
  LIFT_INSET,
  MIN_PLAY_SCALE,
  PRESSES,
  PRESS_LEAD,
  WINDOW,
  liftRest,
  liftScale,
  pictureZone,
  travelMs,
  travelWindow,
  windowFrame,
} from './harness-scene';

describe('the window on the stage', () => {
  it.each([
    [1040, 800],
    [1440, 900],
    [1920, 1080],
    [2560, 1440],
  ])('stays whole inside the picture zone at %ix%i', (w, h) => {
    const zone = pictureZone(w, { left: 64, right: w - 64 }, 110, h - 220);
    const frame = windowFrame(zone);
    expect(frame.x).toBeGreaterThanOrEqual(zone.l - 0.01);
    expect(frame.y).toBeGreaterThanOrEqual(zone.t - 0.01);
    expect(frame.x + WINDOW.w * frame.s).toBeLessThanOrEqual(zone.r + 0.01);
    expect(frame.y + WINDOW.h * frame.s).toBeLessThanOrEqual(zone.b + 0.01);
  });

  it('keeps the body text at 9px or more whenever the film may play', () => {
    expect(12.5 * MIN_PLAY_SCALE).toBeGreaterThanOrEqual(9);
  });
});

describe('the lift', () => {
  it.each([0.73, 0.87, 0.96, 1.13])('draws a lifted card’s 12.5px text at 15px or more at scale %f when there is room', (s) => {
    const z = liftScale(s, 360, 200);
    expect(12.5 * z * s).toBeGreaterThanOrEqual(15 - 1e-9);
    expect(z).toBeLessThanOrEqual(1.7);
  });

  it('never grows a card past the window', () => {
    const z = liftScale(1, 900, 480);
    const rest = liftRest({ x: 100, y: 40, w: 900, h: 480 }, z);
    expect(rest.x).toBeGreaterThanOrEqual(LIFT_INSET);
    expect(rest.y).toBeGreaterThanOrEqual(LIFT_INSET);
    expect(rest.x + rest.w).toBeLessThanOrEqual(WINDOW.w - LIFT_INSET);
    expect(rest.y + rest.h).toBeLessThanOrEqual(WINDOW.h - LIFT_INSET);
  });

  it('centres a card on its source unless that would cross the window’s edge', () => {
    const source = { x: 400, y: 200, w: 200, h: 100 };
    const rest = liftRest(source, 1.5);
    expect(rest.x + rest.w / 2).toBeCloseTo(500);
    expect(rest.y + rest.h / 2).toBeCloseTo(250);
    const edge = liftRest({ x: 900, y: 400, w: 190, h: 140 }, 1.5);
    expect(edge.x + edge.w).toBeCloseTo(WINDOW.w - LIFT_INSET);
    expect(edge.y + edge.h).toBeCloseTo(WINDOW.h - LIFT_INSET);
  });
});

describe('the pointer', () => {
  it('travels 250ms plus 0.5ms a pixel, at most 650ms', () => {
    expect(travelMs(0)).toBe(250);
    expect(travelMs(200)).toBe(350);
    expect(travelMs(2000)).toBe(650);
  });

  it('arrives before each press and never starts before it is allowed to', () => {
    PRESSES.forEach((press, i) => {
      const [t0, t1] = travelWindow(i, 300, press.at - 2000);
      expect(t1).toBe(press.at - PRESS_LEAD);
      expect(t1 - t0).toBe(travelMs(300));
    });
    const [late] = travelWindow(1, 300, 3800);
    expect(late).toBe(3800);
  });
});
