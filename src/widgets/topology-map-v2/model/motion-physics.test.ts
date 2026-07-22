import { describe, expect, it } from "vitest";

import {
  MOMENTUM_SPRING,
  UI_SPRING,
  momentumDecayGain,
  projectMomentum,
  rubberband,
  springAngularFrequency,
  toSpringConstants,
} from "./motion-physics";

describe("house spring family", () => {
  it("declares the two Apple-vocabulary springs with the documented parameters", () => {
    // UI default — critically damped, no overshoot (Designing Fluid Interfaces).
    expect(UI_SPRING).toEqual({ damping: 1.0, response: 0.35 });
    // Momentum — slightly under-damped, reserved for flick/throw releases only.
    expect(MOMENTUM_SPRING).toEqual({ damping: 0.8, response: 0.35 });
  });
});

describe("springAngularFrequency", () => {
  it("is the reciprocal of response (ω = 1/response, rad/s)", () => {
    expect(springAngularFrequency(UI_SPRING)).toBeCloseTo(1 / 0.35, 10);
    expect(springAngularFrequency({ damping: 1, response: 0.34 })).toBeCloseTo(2.941, 3);
    expect(springAngularFrequency({ damping: 1, response: 0.5 })).toBe(2);
  });

  it("shrinks ω as response grows (a longer response settles slower)", () => {
    expect(springAngularFrequency({ damping: 1, response: 0.2 })).toBeGreaterThan(
      springAngularFrequency({ damping: 1, response: 0.4 }),
    );
  });
});

describe("toSpringConstants", () => {
  it("bridges the 2-parameter grammar to the existing stepSpring(ω, ζ) constant system", () => {
    expect(toSpringConstants(UI_SPRING)).toEqual({
      angularFrequency: 1 / 0.35,
      damping: 1.0,
    });
    expect(toSpringConstants(MOMENTUM_SPRING)).toEqual({
      angularFrequency: 1 / 0.35,
      damping: 0.8,
    });
  });

  it("passes damping through verbatim (the overshoot knob is untouched)", () => {
    expect(toSpringConstants({ damping: 0.6, response: 0.3 }).damping).toBe(0.6);
  });
});

describe("momentumDecayGain", () => {
  it("is the geometric-series gain d/(1-d)", () => {
    expect(momentumDecayGain(0.998)).toBeCloseTo(0.998 / 0.002, 6);
    expect(momentumDecayGain(0.5)).toBe(1);
  });

  it("grows without bound as decay approaches 1 (a stickier surface throws further)", () => {
    expect(momentumDecayGain(0.999)).toBeGreaterThan(momentumDecayGain(0.99));
  });
});

describe("projectMomentum", () => {
  it("matches Apple's project(v) = (v/1000)·d/(1-d) for px/s velocity", () => {
    // 1000 px/s at decay 0.998 → (1000/1000)·(0.998/0.002) = 499.
    expect(projectMomentum(1000, 0.998)).toBeCloseTo(499, 6);
  });

  it("is proportional to velocity and sign-preserving", () => {
    expect(projectMomentum(500, 0.998)).toBeCloseTo(projectMomentum(1000, 0.998) / 2, 6);
    expect(projectMomentum(-1000, 0.998)).toBeCloseTo(-projectMomentum(1000, 0.998), 6);
  });

  it("defaults decay to 0.998 (normal scroll feel)", () => {
    expect(projectMomentum(1000)).toBeCloseTo(projectMomentum(1000, 0.998), 10);
  });
});

describe("rubberband", () => {
  it("is 0 at the boundary (no overshoot, no resistance offset)", () => {
    expect(rubberband(0, 800)).toBe(0);
  });

  it("follows less than 1:1 — resistance grows the further past the bound", () => {
    const small = rubberband(50, 800);
    const large = rubberband(400, 800);
    expect(small).toBeGreaterThan(0);
    expect(small).toBeLessThan(50); // always resisted below the raw overshoot
    expect(large).toBeLessThan(400);
    expect(large).toBeGreaterThan(small); // monotonic — more drag, more follow, but sub-linear
  });

  it("is an odd function of overshoot (symmetric past either edge)", () => {
    expect(rubberband(-120, 800)).toBeCloseTo(-rubberband(120, 800), 10);
  });

  it("matches the closed form (overshoot·dim·c)/(dim + c·|overshoot|)", () => {
    const c = 0.55;
    const dim = 800;
    const o = 300;
    expect(rubberband(o, dim, c)).toBeCloseTo((o * dim * c) / (dim + c * Math.abs(o)), 10);
  });
});
