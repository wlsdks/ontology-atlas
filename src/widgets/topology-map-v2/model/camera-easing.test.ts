import { describe, expect, it } from "vitest";

import {
  CAMERA_TRANSITION_MAX_MS,
  CAMERA_TRANSITION_MIN_MS,
  cameraTransitionDurationMs,
  easeCameraKeyframe,
  easeInOutCubic,
  type CameraKeyframe,
} from "./camera-easing";

describe("easeInOutCubic", () => {
  it("pins the endpoints and the symmetric midpoint", () => {
    expect(easeInOutCubic(0)).toBe(0);
    expect(easeInOutCubic(1)).toBe(1);
    expect(easeInOutCubic(0.5)).toBeCloseTo(0.5, 10);
  });

  it("clamps outside the unit interval instead of extrapolating", () => {
    expect(easeInOutCubic(-1)).toBe(0);
    expect(easeInOutCubic(2)).toBe(1);
  });

  it("is symmetric about the midpoint (ease-in mirrors ease-out)", () => {
    for (const t of [0.1, 0.25, 0.4]) {
      expect(easeInOutCubic(t) + easeInOutCubic(1 - t)).toBeCloseTo(1, 10);
    }
  });

  it("starts slower than linear then overtakes (ease-in shape in the first half)", () => {
    expect(easeInOutCubic(0.25)).toBeLessThan(0.25);
    expect(easeInOutCubic(0.75)).toBeGreaterThan(0.75);
  });

  it("is monotonic non-decreasing across the interval", () => {
    let prev = -Infinity;
    for (let t = 0; t <= 1.0001; t += 0.05) {
      const v = easeInOutCubic(t);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });
});

describe("cameraTransitionDurationMs", () => {
  const at = (x: number, y: number, scale: number): CameraKeyframe => ({ x, y, scale });

  it("is the minimum for a no-op (same start and target)", () => {
    expect(cameraTransitionDurationMs(at(0, 0, 1), at(0, 0, 1))).toBe(CAMERA_TRANSITION_MIN_MS);
  });

  it("stays within the [min, max] clamp for any distance", () => {
    const huge = cameraTransitionDurationMs(at(0, 0, 0.24), at(99999, 99999, 2.6));
    expect(huge).toBeLessThanOrEqual(CAMERA_TRANSITION_MAX_MS);
    expect(huge).toBeGreaterThanOrEqual(CAMERA_TRANSITION_MIN_MS);
    expect(huge).toBe(CAMERA_TRANSITION_MAX_MS);
  });

  it("grows monotonically with pan distance (fixed scale)", () => {
    const d1 = cameraTransitionDurationMs(at(0, 0, 1), at(120, 0, 1));
    const d2 = cameraTransitionDurationMs(at(0, 0, 1), at(600, 0, 1));
    expect(d2).toBeGreaterThan(d1);
    expect(d1).toBeGreaterThanOrEqual(CAMERA_TRANSITION_MIN_MS);
  });

  it("grows monotonically with zoom distance (fixed pan)", () => {
    const d1 = cameraTransitionDurationMs(at(0, 0, 1), at(0, 0, 1.2));
    const d2 = cameraTransitionDurationMs(at(0, 0, 1), at(0, 0, 2.4));
    expect(d2).toBeGreaterThan(d1);
  });

  it("is deterministic (same inputs → identical output)", () => {
    const a = cameraTransitionDurationMs(at(10, 20, 1), at(300, 80, 1.6));
    const b = cameraTransitionDurationMs(at(10, 20, 1), at(300, 80, 1.6));
    expect(a).toBe(b);
  });
});

describe("easeCameraKeyframe", () => {
  const start: CameraKeyframe = { x: 0, y: 0, scale: 1 };
  const target: CameraKeyframe = { x: 200, y: -100, scale: 2 };

  it("returns the start at elapsed 0", () => {
    expect(easeCameraKeyframe(start, target, 0, 400)).toEqual(start);
  });

  it("returns the target exactly at/after the duration", () => {
    expect(easeCameraKeyframe(start, target, 400, 400)).toEqual(target);
    expect(easeCameraKeyframe(start, target, 999, 400)).toEqual(target);
  });

  it("returns the target for a non-positive duration (degenerate jump)", () => {
    expect(easeCameraKeyframe(start, target, 0, 0)).toEqual(target);
  });

  it("sits at the geometric midpoint of every axis at half time", () => {
    const mid = easeCameraKeyframe(start, target, 200, 400);
    expect(mid.x).toBeCloseTo(100, 10);
    expect(mid.y).toBeCloseTo(-50, 10);
    expect(mid.scale).toBeCloseTo(1.5, 10);
  });

  it("eases scale in lockstep with pan (all axes share the one warp)", () => {
    const quarter = easeCameraKeyframe(start, target, 100, 400);
    const e = easeInOutCubic(0.25);
    expect(quarter.x).toBeCloseTo(200 * e, 10);
    expect(quarter.scale).toBeCloseTo(1 + 1 * e, 10);
  });
});
