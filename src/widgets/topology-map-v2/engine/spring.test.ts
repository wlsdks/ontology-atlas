import { describe, expect, it } from "vitest";

import { stepSpring, type SpringAxisState } from "./spring";

/**
 * Spec for `stepSpring` — ported from the B2+ prototype's `updateCamera()` /
 * `stepSpring()` (`docs/prototypes/topology-b2plus.html`). `stepSpring`
 * currently throws (unimplemented) so every test below is RED until the lead
 * implements it against this file.
 *
 * `--topology-v2-camera-spring-angfreq` = 1/0.34 rad/s (design doc §2.4).
 */
const ANGULAR_FREQUENCY = 1 / 0.34;
const CRITICAL_DAMPING = 1.0;
const FLICK_DAMPING = 0.82;
const DT_60FPS = 1 / 60;

describe("stepSpring", () => {
  it("matches the exact semi-implicit Euler formula for one 1/60s step from rest", () => {
    // Hand-derived from f = -ω²(value - target) - 2ζω·velocity;
    // v' = velocity + f·dt; x' = value + v'·dt, with value=0, velocity=0,
    // target=10, ω=1/0.34, ζ=1.0, dt=1/60:
    //   f  = -ω²(0 - 10) = ω²·10 ≈ 86.50519031141868
    //   v' = 0 + f·dt     ≈ 1.4417531718569780
    //   x' = 0 + v'·dt    ≈ 0.024029219530949633
    const start: SpringAxisState = { value: 0, velocity: 0 };

    const result = stepSpring(start, 10, DT_60FPS, ANGULAR_FREQUENCY, CRITICAL_DAMPING);

    expect(result.velocity).toBeCloseTo(1.4417531718569780, 6);
    expect(result.value).toBeCloseTo(0.024029219530949633, 6);
  });

  it("does not move when value already equals target and velocity is zero", () => {
    // f = -ω²(target - target) - 2ζω·0 = 0, so v'=velocity=0, x'=value=target.
    const atRest: SpringAxisState = { value: 10, velocity: 0 };

    const result = stepSpring(atRest, 10, DT_60FPS, ANGULAR_FREQUENCY, CRITICAL_DAMPING);

    expect(result.value).toBe(10);
    expect(result.velocity).toBe(0);
  });

  it("critically damped (ζ=1.0) converges to target within ~3s of 60fps steps without overshoot", () => {
    let state: SpringAxisState = { value: 0, velocity: 0 };
    const target = 10;
    let everOvershot = false;

    for (let i = 0; i < 180; i += 1) {
      state = stepSpring(state, target, DT_60FPS, ANGULAR_FREQUENCY, CRITICAL_DAMPING);
      if (state.value > target) everOvershot = true;
    }

    expect(everOvershot).toBe(false);
    // Analytic residual of a critically-damped spring from rest after t=3s:
    // |x - target| = target·(1 + ωt)·e^(-ωt) with ω=1/0.34, t=3
    //              = 10·(1 + 8.8235)·e^(-8.8235) ≈ 0.0146 (discrete Euler ≈ 0.0195).
    // The formula this suite pins cannot mathematically reach 0.005 by 3s, so
    // the convergence tolerance is 0.05 — visually sub-pixel, consistent with
    // the velocity bound below.
    expect(state.value).toBeCloseTo(target, 1);
    expect(Math.abs(state.velocity)).toBeLessThan(0.05);
  });

  it("underdamped flick spring (ζ=0.82) overshoots before settling", () => {
    let state: SpringAxisState = { value: 0, velocity: 0 };
    const target = 10;
    let everOvershot = false;

    for (let i = 0; i < 180; i += 1) {
      state = stepSpring(state, target, DT_60FPS, ANGULAR_FREQUENCY, FLICK_DAMPING);
      if (state.value > target) everOvershot = true;
    }

    expect(everOvershot).toBe(true);
    // still settles back down close to target by the end of the window
    expect(state.value).toBeCloseTo(target, 1);
  });

  it("does not mutate the input state object", () => {
    const start: SpringAxisState = { value: 0, velocity: 0 };
    const frozen = { ...start };

    stepSpring(start, 10, DT_60FPS, ANGULAR_FREQUENCY, CRITICAL_DAMPING);

    expect(start).toEqual(frozen);
  });
});
