import { describe, expect, it } from "vitest";

import { Occupancy, StepOccupancy, sweptBox, worldBox } from "./step-space";

describe("worldBox and sweptBox", () => {
  const rel = { minX: -8, maxX: 8, minY: -4, maxY: 4 };

  it("divides a screen box by the scale about its anchor", () => {
    expect(worldBox({ x: 10, y: 20 }, rel, 2)).toEqual({ minX: 6, maxX: 14, minY: 18, maxY: 22 });
  });

  it("covers the box at both ends of a step, since each edge moves with 1 / scale", () => {
    expect(sweptBox({ x: 10, y: 20 }, rel, 1, 2)).toEqual({ minX: 2, maxX: 18, minY: 16, maxY: 24 });
    expect(sweptBox({ x: 10, y: 20 }, rel, 2, 1)).toEqual({ minX: 2, maxX: 18, minY: 16, maxY: 24 });
  });
});

describe("Occupancy", () => {
  it("reports overlap only for boxes that cross, not boxes that touch", () => {
    const grid = new Occupancy(10);
    grid.add({ minX: 0, maxX: 10, minY: 0, maxY: 10 });
    expect(grid.hits({ minX: 5, maxX: 15, minY: 5, maxY: 15 })).toBe(true);
    expect(grid.hits({ minX: 10, maxX: 20, minY: 0, maxY: 10 })).toBe(false);
  });

  it("counts a box once per cell it sits in and stops at the limit", () => {
    const grid = new Occupancy(10);
    grid.add({ minX: 0, maxX: 25, minY: 0, maxY: 5 });
    expect(grid.count({ minX: 0, maxX: 25, minY: 0, maxY: 5 })).toBe(3);
    expect(grid.count({ minX: 0, maxX: 25, minY: 0, maxY: 5 }, 2)).toBe(2);
  });
});

describe("StepOccupancy", () => {
  it("holds two names apart across the whole step, not only at its centre", () => {
    const names = new StepOccupancy([0.5, 1, 2]);
    names.add({ x: 0, y: 0 }, { minX: 0, maxX: 40, minY: -5, maxY: 5 });
    const other = { minX: -5, maxX: 30, minY: -5, maxY: 5 };
    expect(names.hitsAtCentre({ x: 50, y: 0 }, other)).toBe(false);
    expect(names.hits({ x: 50, y: 0 }, other)).toBe(true);
  });
});
