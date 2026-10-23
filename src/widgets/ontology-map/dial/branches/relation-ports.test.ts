import { describe, expect, it } from "vitest";
import type { DialFrameResult } from "../types";
import { clipBranchRelation } from "./relation-ports";
import { quadAt } from "../flow/geometry";

const curve = { a: { x: 0, y: 0 }, control: { x: 100, y: -20 }, b: { x: 200, y: 0 } };
const frame = { contextOnly: true, marks: { blocks: [
  { id: "a", alpha: 1, box: { minX: -40, maxX: 40, minY: -30, maxY: 30 } },
  { id: "b", alpha: 1, box: { minX: 160, maxX: 240, minY: -30, maxY: 30 } },
] } } as unknown as DialFrameResult;

describe("branch relation ports", () => {
  it("keeps both directed endpoints outside card faces without changing the curve's midpoint", () => {
    const clipped = clipBranchRelation(frame, "a", "b", curve);
    expect(clipped.a.x).toBeGreaterThanOrEqual(46);
    expect(clipped.b.x).toBeLessThanOrEqual(154);
    expect((clipped.a.x + 2 * clipped.control.x + clipped.b.x) / 4).toBeCloseTo(100, 2);
    expect((clipped.a.y + 2 * clipped.control.y + clipped.b.y) / 4).toBeCloseTo(-10, 2);
  });

  it("keeps captioned real-relation paint and hit geometry local instead of preserving a legacy hook", () => {
    const hooked = { ...curve, control: { x: 1000, y: -800 } };
    const clipped = clipBranchRelation(frame, "a", "b", hooked);
    const points = Array.from({ length: 21 }, (_, i) => quadAt(clipped.a, clipped.control, clipped.b, i / 20));
    expect(clipped.a.x).toBeGreaterThanOrEqual(46);
    expect(clipped.b.x).toBeLessThanOrEqual(154);
    expect(points.every(p => p.x >= 46 && p.x <= 154 && p.y > -40 && p.y < 40)).toBe(true);
    expect(points.slice(1).every((p, i) => p.x > points[i]!.x)).toBe(true);
  });

  it("preserves ordinary map and non-card relation geometry", () => {
    expect(clipBranchRelation(null, "a", "b", curve)).toBe(curve);
    expect(clipBranchRelation({ ...frame, contextOnly: false }, "a", "b", curve)).toBe(curve);
    expect(clipBranchRelation(frame, "capability", "project", curve)).toEqual(curve);
  });
});
