import { describe, expect, it } from "vitest";

import { MOTION } from "@/shared/motion/tokens";

import {
  MOMENTUM_SPRING,
  UI_SPRING,
  ZOOM_STEP_TAU_MS,
  easeZoomScale,
  rubberband,
  springAngularFrequency,
  toSpringConstants,
  zoomStepProgress,
} from "./motion-physics";


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
      angularFrequency: 1 / MOTION.base.duration,
      damping: 1.0,
    });
  });

  it("passes damping through verbatim (the overshoot knob is untouched)", () => {
    expect(toSpringConstants({ damping: 0.6, response: 0.3 }).damping).toBe(0.6);
  });
});

describe("zoom step easing", () => {
  it("lands 95% of a step within the fast motion duration and settles exactly", () => {
    expect(zoomStepProgress(MOTION.fast.duration * 1000)).toBeCloseTo(0.95, 2);
    expect(zoomStepProgress(ZOOM_STEP_TAU_MS * 7)).toBe(1);
  });

  it("starts at once and never runs backwards for a frame stamped before the input", () => {
    expect(zoomStepProgress(-5)).toBe(0);
    expect(zoomStepProgress(8.3)).toBeGreaterThan(0.15);
  });

  it("interpolates the scale in log space, so equal steps feel equal in and out", () => {
    expect(easeZoomScale(1, 4, 0.5)).toBeCloseTo(2, 12);
    expect(easeZoomScale(4, 1, 0.5)).toBeCloseTo(2, 12);
    expect(easeZoomScale(1.5, 3, 0)).toBe(1.5);
    expect(easeZoomScale(1.5, 3, 1)).toBeCloseTo(3, 12);
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
    expect(small).toBeLessThan(50);
    expect(large).toBeLessThan(400);
    expect(large).toBeGreaterThan(small);
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
