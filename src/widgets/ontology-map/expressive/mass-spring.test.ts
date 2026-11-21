import { describe, expect, it } from "vitest";

import { stepSpring } from "../engine/spring";

import {
  clampDropVelocity,
  massForDegree,
  pressPeak,
  pressResponse,
  releaseSpringForMass,
  springAtRest,
  stepDampedSpring,
} from "./mass-spring";

const TOKENS = { heavyDegree: 12, angFreq: 16, heavyZeta: 0.55 };

describe("mass — degree on a smoothstep", () => {
  it("a leaf weighs nothing, a hub at the heavy degree weighs one", () => {
    expect(massForDegree(0, 12)).toBe(0);
    expect(massForDegree(12, 12)).toBe(1);
    expect(massForDegree(40, 12)).toBe(1);
  });
  it("is monotone, so a degree change never pops", () => {
    let previous = -1;
    for (let d = 0; d <= 12; d += 1) {
      const m = massForDegree(d, 12);
      expect(m).toBeGreaterThanOrEqual(previous);
      previous = m;
    }
  });
  it("a zero heavy degree makes everything light instead of dividing by zero", () => {
    expect(massForDegree(5, 0)).toBe(0);
  });
});

describe("release spring — light snaps, heavy rings", () => {
  it("a light node is critically damped and a heavy one is not", () => {
    expect(releaseSpringForMass(0, TOKENS)).toEqual({ omega: 16, zeta: 1 });
    expect(releaseSpringForMass(1, TOKENS)).toEqual({ omega: 16, zeta: 0.55 });
  });

  /** Simulate a release from a 100-unit offset and record the farthest point past rest. */
  function overshootFor(mass: number): { overshoot: number; settleMs: number } {
    const spring = releaseSpringForMass(mass, TOKENS);
    let x = 100;
    let v = 0;
    let overshoot = 0;
    let settleMs = 0;
    for (let t = 0; t < 2; t += 1 / 120) {
      ({ value: x, velocity: v } = stepDampedSpring(x, v, 0, 1 / 120, spring));
      overshoot = Math.min(overshoot, x);
      if (settleMs === 0 && springAtRest(x, v, 0, 1)) settleMs = t * 1000;
    }
    return { overshoot: -overshoot, settleMs };
  }

  it("a heavy node overshoots once, within a radius step, and takes longer to sit", () => {
    const heavy = overshootFor(1);
    const light = overshootFor(0);
    expect(light.overshoot).toBeLessThan(0.5);
    expect(heavy.overshoot).toBeGreaterThan(5);
    expect(heavy.overshoot).toBeLessThan(16);
    expect(heavy.settleMs).toBeGreaterThan(light.settleMs);
    expect(heavy.settleMs).toBeLessThan(700);
  });

  it("a hitchy 100 ms frame does not blow the integrator up", () => {
    const spring = releaseSpringForMass(1, TOKENS);
    const r = stepDampedSpring(100, 0, 0, 0.1, spring);
    expect(Math.abs(r.value)).toBeLessThan(100);
    expect(Number.isFinite(r.velocity)).toBe(true);
  });
});

describe("press — an underdamped unit step", () => {
  const spring = { omega: 20, zeta: 0.45 };
  it("starts at 0, peaks above 1, and settles to 1", () => {
    expect(pressResponse(0, spring)).toBe(0);
    let peak = 0;
    for (let t = 0; t < 1; t += 0.005) peak = Math.max(peak, pressResponse(t, spring));
    expect(peak).toBeGreaterThan(1.15);
    expect(peak).toBeCloseTo(pressPeak(spring), 2);
    expect(pressResponse(1.5, spring)).toBeCloseTo(1, 2);
  });
  it("a critically damped press never overshoots", () => {
    const crit = { omega: 20, zeta: 1 };
    for (let t = 0; t < 1; t += 0.005) expect(pressResponse(t, crit)).toBeLessThanOrEqual(1);
    expect(pressPeak(crit)).toBe(1);
  });
});

describe("drop — the hand's velocity is carried, capped to one radius step", () => {
  it("a slow release passes through unchanged", () => {
    expect(clampDropVelocity(30, 40, { omega: 16, zeta: 0.55 }, 14)).toEqual({ vx: 30, vy: 40 });
  });
  it("a fast release is scaled so the excursion stays under the cap", () => {
    const spring = { omega: 16, zeta: 0.55 };
    const { vx, vy } = clampDropVelocity(3000, 0, spring, 14);
    let x = 0;
    let v = vx;
    let peak = 0;
    for (let t = 0; t < 1; t += 1 / 240) {
      ({ value: x, velocity: v } = stepDampedSpring(x, v, 0, 1 / 240, spring));
      peak = Math.max(peak, Math.abs(x));
    }
    expect(vy).toBe(0);
    expect(peak).toBeLessThanOrEqual(14.5);
    expect(peak).toBeGreaterThan(8);
  });
});

/**
 * The formula, written twice, must stay one formula.
 *
 * `stepDampedSpring` re-implements `engine/spring.ts#stepSpring` so it can sub-step at
 * 240 Hz without allocating a state object per sub-step — the drag path steps two axes
 * for every node in the tug set on every frame. What duplication risks is drift, so the
 * two are compared here at a dt small enough that sub-stepping does not apply.
 */
describe("the sub-stepped integrator agrees with the engine's spring", () => {
  it("matches `stepSpring` step for step below the sub-step interval", () => {
    const spring = { omega: 16, zeta: 0.55 };
    let mine = { value: 12, velocity: -3 };
    let engine = { value: 12, velocity: -3 };
    const dt = 1 / 240;
    for (let i = 0; i < 40; i += 1) {
      mine = stepDampedSpring(mine.value, mine.velocity, 0, dt, spring);
      engine = stepSpring(engine, 0, dt, spring.omega, spring.zeta);
      expect(mine.value).toBeCloseTo(engine.value, 10);
      expect(mine.velocity).toBeCloseTo(engine.velocity, 10);
    }
  });
});
