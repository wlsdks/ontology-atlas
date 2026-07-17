import { describe, expect, it } from "vitest";

import { hexPoints, interpolateCornerRadius, squarePoints } from "./node-shapes";

describe("hexPoints", () => {
  it("returns exactly 6 points", () => {
    expect(hexPoints(0, 0, 10)).toHaveLength(6);
  });

  it("every point sits exactly r away from the center", () => {
    const points = hexPoints(0, 0, 10);
    for (const p of points) {
      expect(Math.hypot(p.x, p.y)).toBeCloseTo(10, 6);
    }
  });

  it("the first point is rotated -90deg (straight up from center, prototype `a = i*60 - 90`)", () => {
    const [first] = hexPoints(0, 0, 10);
    expect(first.x).toBeCloseTo(0, 6);
    expect(first.y).toBeCloseTo(-10, 6);
  });

  it("is centered correctly for a non-origin center", () => {
    const points = hexPoints(50, 30, 10);
    for (const p of points) {
      expect(Math.hypot(p.x - 50, p.y - 30)).toBeCloseTo(10, 6);
    }
  });
});

describe("squarePoints", () => {
  it("returns exactly 4 points", () => {
    expect(squarePoints(0, 0, 10)).toHaveLength(4);
  });

  it("every point sits at (±s, ±s) from the center", () => {
    const points = squarePoints(0, 0, 10);
    const xs = points.map((p) => p.x).sort((a, b) => a - b);
    const ys = points.map((p) => p.y).sort((a, b) => a - b);
    expect(xs).toEqual([-10, -10, 10, 10]);
    expect(ys).toEqual([-10, -10, 10, 10]);
  });
});

describe("interpolateCornerRadius", () => {
  it("is minRadius at farT=0", () => {
    expect(interpolateCornerRadius(4, 25, 0)).toBeCloseTo(4, 6);
  });

  it("is fullRadius at farT=1 (full convergence to a circle)", () => {
    expect(interpolateCornerRadius(4, 25, 1)).toBeCloseTo(25, 6);
  });

  it("is the linear midpoint at farT=0.5", () => {
    expect(interpolateCornerRadius(4, 24, 0.5)).toBeCloseTo(14, 6);
  });

  it("is monotonically non-decreasing as farT rises from 0 to 1", () => {
    let previous = -Infinity;
    for (let i = 0; i <= 20; i += 1) {
      const value = interpolateCornerRadius(4, 25, i / 20);
      expect(value).toBeGreaterThanOrEqual(previous - 1e-9);
      previous = value;
    }
  });
});
