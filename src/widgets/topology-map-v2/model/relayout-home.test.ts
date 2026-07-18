import { describe, expect, it } from "vitest";

import { initHomeSpring, isHomeSpringConverged, stepHomeSpring } from "./relayout-home";

/**
 * C1 B3 — auto-arrange restores canonical layout. Each dragged/displaced node
 * springs back to its own `homeX`/`homeY` (`topology-world.ts`) over a short
 * critically-damped transition — reusing `engine/spring.ts#stepSpring` (the
 * same primitive the camera uses) rather than a bespoke lerp, so the motion
 * language stays consistent ("no pop", monotonic approach).
 */
describe("stepHomeSpring / isHomeSpringConverged", () => {
  // A representative critically-damped angular frequency — this pure-math
  // test isn't tied to a specific `--topology-v2-*` token; the caller
  // (`use-topology-loop.ts`'s auto-arrange homing) passes
  // `--topology-v2-camera-spring-angfreq-transition` (dive-zoom fix's split).
  const ANGULAR_FREQUENCY = 2.941;
  const DAMPING = 1.0; // critically damped

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
