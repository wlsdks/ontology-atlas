import { describe, expect, it } from "vitest";

import { easeMotion, fitToBox, seedPositions } from "./library-graph-layout";

/**
 * What is left of the layout after the physics moved out: the seed spiral, the uniform
 * fit, and the sampled easing curve. The cases for `layoutLibraryGraph`,
 * `alignToLongestAxis` and `interpolatePositions` went with the functions themselves on
 * 2026-09-07 — the live simulation answers all three, and `library-force-simulation.test.ts`
 * is where those claims are now made.
 */

describe("the seed spiral", () => {
  it("gives every node a finite starting point", () => {
    const seeds = seedPositions(Array.from({ length: 12 }, (_, index) => `n${index}`));
    expect(seeds.size).toBe(12);
    for (const point of seeds.values()) {
      expect(Number.isFinite(point.x)).toBe(true);
      expect(Number.isFinite(point.y)).toBe(true);
    }
  });

  it("seeds a spiral, not a dial: no two nodes share a radius", () => {
    const seeds = seedPositions(Array.from({ length: 24 }, (_, index) => `n${index}`));
    const radii = [...seeds.values()].map((point) => Math.hypot(point.x, point.y));
    expect(new Set(radii.map((radius) => radius.toFixed(4))).size).toBe(radii.length);
  });

  it("seeds an empty graph without inventing a node", () => {
    expect(seedPositions([]).size).toBe(0);
  });
});

describe("fitting the layout into the canvas box", () => {
  it("uses one scale for both axes, so a distance means the same thing in x and y", () => {
    const points = new Map([
      ["a", { x: -100, y: -10 }],
      ["b", { x: 100, y: 10 }],
    ]);
    const fitted = fitToBox(points, { width: 600, height: 320, padding: 20 });
    const a = fitted.get("a");
    const b = fitted.get("b");
    // The world span is 200 × 20; a per-axis fit would have stretched y by 10×.
    const scaleX = (b!.x - a!.x) / 200;
    const scaleY = (b!.y - a!.y) / 20;
    expect(scaleX).toBeCloseTo(scaleY, 6);
  });

  it("keeps every fitted point inside the padded box", () => {
    const points = new Map(
      Array.from({ length: 30 }, (_, index) => [
        `n${index}`,
        { x: Math.cos(index) * 500, y: Math.sin(index) * 500 },
      ] as const),
    );
    const box = { width: 640, height: 320, padding: 26 };
    for (const point of fitToBox(points, box).values()) {
      expect(point.x).toBeGreaterThanOrEqual(box.padding - 0.001);
      expect(point.x).toBeLessThanOrEqual(box.width - box.padding + 0.001);
      expect(point.y).toBeGreaterThanOrEqual(box.padding - 0.001);
      expect(point.y).toBeLessThanOrEqual(box.height - box.padding + 0.001);
    }
  });

  it("centres a single node rather than dividing by a zero span", () => {
    const fitted = fitToBox(new Map([["only", { x: 12, y: -4 }]]), {
      width: 600,
      height: 320,
      padding: 26,
    });
    expect(fitted.get("only")).toEqual({ x: 300, y: 160 });
  });
});

describe("the sampled `--motion-ease` curve", () => {
  it("decelerates: more than half the distance is covered in the first half of the time", () => {
    expect(easeMotion(0.5)).toBeGreaterThan(0.5);
    expect(easeMotion(0)).toBe(0);
    expect(easeMotion(1)).toBe(1);
  });

  it("never moves backwards", () => {
    let previous = -1;
    for (let t = 0; t <= 1.0001; t += 0.05) {
      const value = easeMotion(t);
      expect(value).toBeGreaterThanOrEqual(previous);
      previous = value;
    }
  });

  it("matches `cubic-bezier(0.25, 0.1, 0.25, 1)` at its midpoint", () => {
    // The curve's own y at x = 0.5, computed from the control points, is 0.8024…
    expect(easeMotion(0.5)).toBeCloseTo(0.8024, 3);
  });
});
