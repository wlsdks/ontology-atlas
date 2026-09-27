import { describe, expect, it } from "vitest";

import {
  REALM_PARALLAX_FACTOR_DEPTH2,
  REALM_PARALLAX_FACTOR_DEPTH3,
  REALM_PARALLAX_TAU_S,
  ZERO_PARALLAX,
  depthParallaxFactorForDepth,
  depthParallaxOffsetFor,
  isDepthParallaxActive,
  stepDepthParallax,
} from "./realm-depth-parallax";

describe("depthParallaxFactorForDepth", () => {
  it("gives no parallax at depth <= 1, 3% at depth 2 and 6% at depth 3+", () => {
    expect(depthParallaxFactorForDepth(0)).toBe(0);
    expect(depthParallaxFactorForDepth(1)).toBe(0);
    expect(depthParallaxFactorForDepth(2)).toBe(REALM_PARALLAX_FACTOR_DEPTH2);
    expect(depthParallaxFactorForDepth(3)).toBe(REALM_PARALLAX_FACTOR_DEPTH3);
    expect(depthParallaxFactorForDepth(8)).toBe(REALM_PARALLAX_FACTOR_DEPTH3);
  });

  it("lags further at greater depth", () => {
    expect(depthParallaxFactorForDepth(3)).toBeGreaterThan(depthParallaxFactorForDepth(2));
  });
});

describe("stepDepthParallax", () => {
  it("is always 0 at factor 0 (the depth <= 1 band)", () => {
    const next = stepDepthParallax({ x: 5, y: -3 }, { x: 100, y: 100 }, 0, 1 / 60);
    expect(next.x).toBeCloseTo(5 * Math.exp(-(1 / 60) / REALM_PARALLAX_TAU_S));
    expect(next.y).toBeCloseTo(-3 * Math.exp(-(1 / 60) / REALM_PARALLAX_TAU_S));
  });

  it("charges in proportion to factor when the camera moves", () => {
    const next = stepDepthParallax(ZERO_PARALLAX, { x: 200, y: 0 }, 0.06, 1 / 60);
    expect(next.x).toBeCloseTo(0.06 * 200);
    expect(next.y).toBe(0);
  });

  it("decays the offset exponentially to 0 when the camera stops (delta 0)", () => {
    let off = { x: 10, y: 10 };
    for (let i = 0; i < 120; i += 1) {
      off = stepDepthParallax(off, { x: 0, y: 0 }, 0.06, 1 / 60);
    }
    expect(Math.hypot(off.x, off.y)).toBeLessThan(0.001);
  });

  it("converges a constant-speed pan to a small steady lag near factor, v and tau", () => {
    const dt = 1 / 60;
    const vWorldPerFrame = 30;
    let off = ZERO_PARALLAX;
    for (let i = 0; i < 600; i += 1) {
      off = stepDepthParallax(off, { x: vWorldPerFrame, y: 0 }, 0.06, dt);
    }
    const velWorldPerSec = vWorldPerFrame / dt;
    const expected = 0.06 * velWorldPerSec * REALM_PARALLAX_TAU_S;
    // A discrete approximation, so within 20% is the same order of magnitude.
    expect(off.x).toBeGreaterThan(expected * 0.8);
    expect(off.x).toBeLessThan(expected * 1.2);
  });

  it("decays at once for tau <= 0 (no residue), safe for reduced motion", () => {
    const next = stepDepthParallax({ x: 9, y: 9 }, { x: 0, y: 0 }, 0.06, 1 / 60, 0);
    expect(next).toEqual({ x: 0, y: 0 });
  });

  it("is deterministic: the same input gives the same output", () => {
    const a = stepDepthParallax({ x: 1, y: 2 }, { x: 3, y: 4 }, 0.03, 1 / 60);
    const b = stepDepthParallax({ x: 1, y: 2 }, { x: 3, y: 4 }, 0.03, 1 / 60);
    expect(a).toEqual(b);
  });
});

describe("isDepthParallaxActive", () => {
  it("is inactive below epsilon (converged)", () => {
    expect(isDepthParallaxActive({ x: 0.001, y: 0.001 })).toBe(false);
    expect(isDepthParallaxActive({ x: 0.5, y: 0 })).toBe(true);
    expect(isDepthParallaxActive({ x: 0, y: -0.5 })).toBe(true);
  });
});

describe("depthParallaxOffsetFor", () => {
  const d2 = { x: 1, y: 2 };
  const d3 = { x: 3, y: 4 };

  it("gives 0 offset for an unknown depth or depth <= 1", () => {
    expect(depthParallaxOffsetFor(undefined, d2, d3)).toEqual(ZERO_PARALLAX);
    expect(depthParallaxOffsetFor(0, d2, d3)).toEqual(ZERO_PARALLAX);
    expect(depthParallaxOffsetFor(1, d2, d3)).toEqual(ZERO_PARALLAX);
  });

  it("uses the depth 2 band at depth 2 and the depth 3 band at depth 3+", () => {
    expect(depthParallaxOffsetFor(2, d2, d3)).toBe(d2);
    expect(depthParallaxOffsetFor(3, d2, d3)).toBe(d3);
    expect(depthParallaxOffsetFor(6, d2, d3)).toBe(d3);
  });
});
