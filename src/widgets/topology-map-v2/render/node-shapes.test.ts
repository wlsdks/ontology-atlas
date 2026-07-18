import { describe, expect, it } from "vitest";

import { domainPinTicks, hexPoints, interpolateCornerRadius, projectPinTicks, squarePoints } from "./node-shapes";

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

describe("domainPinTicks", () => {
  it("returns exactly 4 ticks — two above, two below the chip", () => {
    const ticks = domainPinTicks(0, 0, 20);
    expect(ticks).toHaveLength(4);
    const above = ticks.filter((t) => t.y1 < 0);
    const below = ticks.filter((t) => t.y1 > 0);
    expect(above).toHaveLength(2);
    expect(below).toHaveLength(2);
  });

  it("every tick is vertical (x1 === x2) and sits at the ±0.45·s offsets", () => {
    const s = 20;
    const ticks = domainPinTicks(100, 50, s);
    for (const t of ticks) expect(t.x1).toBeCloseTo(t.x2, 9);
    const xs = [...new Set(ticks.map((t) => Math.round((t.x1 - 100) * 100) / 100))].sort((a, b) => a - b);
    expect(xs).toEqual([-0.45 * s, 0.45 * s]);
  });

  it("each leg is s·0.34 long and starts exactly at the square edge (±s)", () => {
    const s = 20;
    const cy = 50;
    const tick = s * 0.34;
    const ticks = domainPinTicks(0, cy, s);
    const top = ticks.find((t) => t.y1 === cy - s);
    const bottom = ticks.find((t) => t.y1 === cy + s);
    expect(top?.y2).toBeCloseTo(cy - s - tick, 9);
    expect(bottom?.y2).toBeCloseTo(cy + s + tick, 9);
  });
});

describe("projectPinTicks", () => {
  it("returns exactly 4 ticks — one per cardinal direction (up/down/left/right)", () => {
    const ticks = projectPinTicks(0, 0, 25);
    expect(ticks).toHaveLength(4);
  });

  it("each tick is a straight 6px line starting exactly at the node edge (r)", () => {
    const r = 25;
    const cx = 100;
    const cy = 50;
    const ticks = projectPinTicks(cx, cy, r);
    for (const t of ticks) {
      const len = Math.hypot(t.x2 - t.x1, t.y2 - t.y1);
      expect(len).toBeCloseTo(6, 6);
      const startDist = Math.hypot(t.x1 - cx, t.y1 - cy);
      expect(startDist).toBeCloseTo(r, 6);
    }
  });

  it("covers all four cardinal directions, none diagonal", () => {
    const r = 25;
    const ticks = projectPinTicks(0, 0, r);
    const top = ticks.find((t) => t.y1 < 0 && t.x1 === 0);
    const bottom = ticks.find((t) => t.y1 > 0 && t.x1 === 0);
    const left = ticks.find((t) => t.x1 < 0 && t.y1 === 0);
    const right = ticks.find((t) => t.x1 > 0 && t.y1 === 0);
    expect(top).toBeDefined();
    expect(bottom).toBeDefined();
    expect(left).toBeDefined();
    expect(right).toBeDefined();
    expect(top?.y2).toBeCloseTo(-r - 6, 6);
    expect(bottom?.y2).toBeCloseTo(r + 6, 6);
    expect(left?.x2).toBeCloseTo(-r - 6, 6);
    expect(right?.x2).toBeCloseTo(r + 6, 6);
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
