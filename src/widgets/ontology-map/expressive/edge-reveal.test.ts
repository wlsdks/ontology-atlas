import { describe, expect, it } from "vitest";

import { edgeRevealProgress, partialQuadratic, revealSpan } from "./edge-reveal";

const A = { x: 0, y: 0 };
const C = { x: 50, y: 40 };
const B = { x: 100, y: 0 };

function at(p: { x: number; y: number }, c: { x: number; y: number }, q: { x: number; y: number }, t: number) {
  const u = 1 - t;
  return { x: u * u * p.x + 2 * u * t * c.x + t * t * q.x, y: u * u * p.y + 2 * u * t * c.y + t * t * q.y };
}

describe("partialQuadratic", () => {
  it("keeps the source end and lands on the curve at t when drawn from a", () => {
    const part = partialQuadratic(A, C, B, 0.3, "a");
    expect(part.a).toEqual(A);
    const expected = at(A, C, B, 0.3);
    expect(part.b.x).toBeCloseTo(expected.x, 9);
    expect(part.b.y).toBeCloseTo(expected.y, 9);
    const mid = at(part.a, part.control, part.b, 0.5);
    const onCurve = at(A, C, B, 0.15);
    expect(mid.x).toBeCloseTo(onCurve.x, 9);
    expect(mid.y).toBeCloseTo(onCurve.y, 9);
  });

  it("keeps the target end and starts at 1 - t when drawn from b", () => {
    const part = partialQuadratic(A, C, B, 0.3, "b");
    expect(part.b).toEqual(B);
    const expected = at(A, C, B, 0.7);
    expect(part.a.x).toBeCloseTo(expected.x, 9);
    expect(part.a.y).toBeCloseTo(expected.y, 9);
  });

  it("returns the whole curve at 1", () => {
    const part = partialQuadratic(A, C, B, 1, "a");
    expect(part.control).toEqual(C);
    expect(part.b).toEqual(B);
  });
});

describe("edgeRevealProgress", () => {
  it("is all lit under reduced motion, whatever the ramp", () => {
    expect(edgeRevealProgress(0, true)).toBe(1);
  });

  it("starts at 0, rises monotonically and ends at exactly 1", () => {
    expect(edgeRevealProgress(0, false)).toBe(0);
    let previous = 0;
    for (let r = 0.05; r < 0.99; r += 0.05) {
      const p = edgeRevealProgress(r, false);
      expect(p).toBeGreaterThan(previous);
      previous = p;
    }
    expect(edgeRevealProgress(0.999, false)).toBe(1);
    expect(edgeRevealProgress(Number.NaN, false)).toBe(1);
  });

  it("moves less than the ramp does on its first step, so the first frame is not a cut", () => {
    expect(edgeRevealProgress(0.27, false)).toBeLessThan(0.2);
  });
});

describe("revealSpan", () => {
  it("covers [0, p] from the source and [1 - p, 1] from the target", () => {
    expect(revealSpan({ progress: 0.4, from: "a", baseLift: 0 })).toEqual({ lo: 0, hi: 0.4 });
    const fromB = revealSpan({ progress: 0.4, from: "b", baseLift: 0 });
    expect(fromB.lo).toBeCloseTo(0.6, 9);
    expect(fromB.hi).toBe(1);
  });
});
