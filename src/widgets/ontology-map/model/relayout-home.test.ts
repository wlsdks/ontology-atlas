import { describe, expect, it } from "vitest";

import { initHomeSpring, isHomeSpringConverged, stepHomeSpring } from "./relayout-home";

/**
 * Auto-arrange springs each displaced node back to its `homeX`/`homeY` with the camera's
 * `engine/spring.ts` `stepSpring`, so the approach is monotonic and never pops.
 */
describe("stepHomeSpring / isHomeSpringConverged", () => {
  // The caller passes `--map-camera-spring-angfreq-transition`; any critical value serves here.
  const ANGULAR_FREQUENCY = 2.941;
  const DAMPING = 1.0;

  it("converges to the home coordinate after enough steps", () => {
    let state = initHomeSpring(500, -300);
    const homeX = 0;
    const homeY = 0;
    for (let i = 0; i < 300; i += 1) {
      state = stepHomeSpring(state, homeX, homeY, 1 / 60, ANGULAR_FREQUENCY, DAMPING);
    }
    expect(state.x.value).toBeCloseTo(homeX, 1);
    expect(state.y.value).toBeCloseTo(homeY, 1);
    expect(isHomeSpringConverged(state, homeX, homeY, 0.5)).toBe(true);
  });

  it("is not converged immediately after a large displacement", () => {
    const state = initHomeSpring(500, -300);
    expect(isHomeSpringConverged(state, 0, 0, 0.5)).toBe(false);
  });

  it("starts exactly at the seeded position with zero velocity", () => {
    const state = initHomeSpring(12, 34);
    expect(state.x).toEqual({ value: 12, velocity: 0 });
    expect(state.y).toEqual({ value: 34, velocity: 0 });
  });

  it("moves monotonically closer to home each step (no overshoot pop) for a critically damped step", () => {
    let state = initHomeSpring(100, 0);
    let prevDistance = Infinity;
    for (let i = 0; i < 60; i += 1) {
      state = stepHomeSpring(state, 0, 0, 1 / 60, ANGULAR_FREQUENCY, DAMPING);
      const distance = Math.abs(state.x.value);
      expect(distance).toBeLessThanOrEqual(prevDistance + 1e-9);
      prevDistance = distance;
    }
  });
});
