import { describe, expect, it } from "vitest";

import { bezierPoint, computeBowControlPoint, type Point } from "./traces";

describe("computeBowControlPoint", () => {
  it("never bows further than maxBow*blend from the segment midpoint", () => {
    const a: Point = { x: 0, y: 0 };
    const b: Point = { x: 500, y: 0 }; // far apart, so the raw pull vector would exceed maxBow
    const maxBow = 70;
    const blend = 0.46;

    const control = computeBowControlPoint(a, b, maxBow, blend);
    const mid: Point = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const distanceFromMid = Math.hypot(control.x - mid.x, control.y - mid.y);

    expect(distanceFromMid).toBeLessThanOrEqual(maxBow * blend + 1e-6);
  });

  it("scales the bow distance by the blend factor for a short segment (well under maxBow)", () => {
    // a and b close together near the origin at different angles so the
    // "pull toward origin-facing angle" vector is short and unambiguous.
    const a: Point = { x: 10, y: 0 };
    const b: Point = { x: 0, y: 10 };
    const maxBowLarge = 1000; // effectively uncapped
    const blend = 0.5;

    const control = computeBowControlPoint(a, b, maxBowLarge, blend);
    const mid: Point = { x: 5, y: 5 };
    const distanceFromMid = Math.hypot(control.x - mid.x, control.y - mid.y);

    // Should scale down from the uncapped pull vector by exactly `blend`.
    const controlAtFullBlend = computeBowControlPoint(a, b, maxBowLarge, 1);
    const fullDistance = Math.hypot(controlAtFullBlend.x - mid.x, controlAtFullBlend.y - mid.y);
    expect(distanceFromMid).toBeCloseTo(fullDistance * blend, 4);
  });

  it("uses a different bow amount for depends (maxBow=92, blend=0.62) vs contains (70, 0.46)", () => {
    const a: Point = { x: 0, y: 0 };
    const b: Point = { x: 500, y: 0 };

    const containsControl = computeBowControlPoint(a, b, 70, 0.46);
    const dependsControl = computeBowControlPoint(a, b, 92, 0.62);
    const mid: Point = { x: 250, y: 0 };

    const containsDistance = Math.hypot(containsControl.x - mid.x, containsControl.y - mid.y);
    const dependsDistance = Math.hypot(dependsControl.x - mid.x, dependsControl.y - mid.y);

    expect(dependsDistance).toBeGreaterThan(containsDistance);
  });
});

describe("bezierPoint", () => {
  const p0: Point = { x: 0, y: 0 };
  const p1: Point = { x: 50, y: 100 };
  const p2: Point = { x: 100, y: 0 };

  it("is p0 at t=0", () => {
    const point = bezierPoint(p0, p1, p2, 0);
    expect(point.x).toBeCloseTo(0, 6);
    expect(point.y).toBeCloseTo(0, 6);
  });

  it("is p2 at t=1", () => {
    const point = bezierPoint(p0, p1, p2, 1);
    expect(point.x).toBeCloseTo(100, 6);
    expect(point.y).toBeCloseTo(0, 6);
  });

  it("matches the standard quadratic bezier formula at t=0.5", () => {
    // B(0.5) = 0.25*p0 + 0.5*p1 + 0.25*p2 = 0.25*(0,0) + 0.5*(50,100) + 0.25*(100,0)
    //        = (0,0) + (25,50) + (25,0) = (50, 50)
    const point = bezierPoint(p0, p1, p2, 0.5);
    expect(point.x).toBeCloseTo(50, 6);
    expect(point.y).toBeCloseTo(50, 6);
  });
});
