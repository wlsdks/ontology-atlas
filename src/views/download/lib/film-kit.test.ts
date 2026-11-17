import { describe, expect, it } from 'vitest';

import { cameraAt, projectPoint } from './film-kit';

const KEYS = [
  { at: 0, cx: 100, cy: 100, zoom: 1 },
  { at: 0.5, cx: 300, cy: 100, zoom: 2 },
];

describe('cameraAt', () => {
  it('holds the first shot before it and the last after it', () => {
    expect(cameraAt(KEYS, -1)).toEqual({ cx: 100, cy: 100, zoom: 1 });
    expect(cameraAt(KEYS, 0.9)).toEqual({ cx: 300, cy: 100, zoom: 2 });
  });

  it('eases between keys, passing the midpoint halfway', () => {
    const mid = cameraAt(KEYS, 0.25);
    expect(mid.cx).toBeCloseTo(200);
    expect(mid.zoom).toBeCloseTo(1.5);
    expect(cameraAt(KEYS, 0.05).cx).toBeLessThan(110);
  });

  it('creeps the zoom forward with progress', () => {
    expect(cameraAt(KEYS, 1, 0.1).zoom).toBeCloseTo(2.2);
  });
});

describe('projectPoint', () => {
  it('puts the shot centre on the stage centre and scales distance by zoom', () => {
    const shot = { cx: 300, cy: 200, zoom: 2 };
    expect(projectPoint(800, 600, shot, 300, 200)).toEqual({ x: 400, y: 300 });
    expect(projectPoint(800, 600, shot, 310, 200)).toEqual({ x: 420, y: 300 });
  });
});
