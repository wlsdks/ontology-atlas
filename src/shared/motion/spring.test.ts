import { describe, expect, it } from "vitest";

import { SPRING, springEasing, springSettleMs, springState, springVisualMs, type Spring } from "./spring";

function rk4(spring: Spring, tSec: number, x0: number, v0: number, mass: number): number {
  const dt = 1e-5;
  const c = 2 * spring.dampingRatio * Math.sqrt(spring.stiffness * mass);
  const acc = (x: number, v: number) => (-spring.stiffness * (x - 1) - c * v) / mass;
  let x = x0;
  let v = v0;
  for (let t = 0; t < tSec - dt / 2; t += dt) {
    const k1x = v;
    const k1v = acc(x, v);
    const k2x = v + (dt / 2) * k1v;
    const k2v = acc(x + (dt / 2) * k1x, v + (dt / 2) * k1v);
    const k3x = v + (dt / 2) * k2v;
    const k3v = acc(x + (dt / 2) * k2x, v + (dt / 2) * k2v);
    const k4x = v + dt * k3v;
    const k4v = acc(x + dt * k3x, v + dt * k3v);
    x += (dt / 6) * (k1x + 2 * k2x + 2 * k3x + k4x);
    v += (dt / 6) * (k1v + 2 * k2v + 2 * k3v + k4v);
  }
  return x;
}

const TABLE = {
  control: { visual: 148, settle: 239 },
  surface: { visual: 242, settle: 391 },
  canvas: { visual: 354, settle: 571 },
} as const;

describe("house springs", () => {
  it.each(Object.keys(SPRING) as (keyof typeof SPRING)[])("%s matches RK4 for mass 1 and 2 and a carried velocity", (name) => {
    for (const mass of [1, 2]) {
      for (const v0 of [0, 3]) {
        for (const t of [0.05, 0.15, 0.3, 0.6]) {
          expect(Math.abs(springState(SPRING[name], t, { x0: 0, v0 }, mass).x - rk4(SPRING[name], t, 0, v0, mass))).toBeLessThanOrEqual(1e-4);
        }
      }
    }
  });

  it.each(Object.keys(SPRING) as (keyof typeof SPRING)[])("%s overshoots 0.63% and keeps the table's times", (name) => {
    let peak = 0;
    for (let t = 0; t < 1; t += 1e-4) peak = Math.max(peak, springState(SPRING[name], t).x);
    expect(Math.abs(peak - 1.0063)).toBeLessThanOrEqual(0.0002);
    expect(Math.abs(springVisualMs(SPRING[name]) - TABLE[name].visual)).toBeLessThanOrEqual(2);
    expect(Math.abs(springSettleMs(SPRING[name]) - TABLE[name].settle)).toBeLessThanOrEqual(2);
  });

  it("slows a heavy concept without changing its overshoot", () => {
    expect(Math.abs(springVisualMs(SPRING.canvas, 2) - 501)).toBeLessThanOrEqual(2);
    expect(Math.abs(springSettleMs(SPRING.canvas, 2) - 808)).toBeLessThanOrEqual(2);
  });

  it.each(Object.keys(SPRING) as (keyof typeof SPRING)[])("%s easing has at most 33 stops within 0.005", (name) => {
    const stops = springEasing(SPRING[name]).slice("linear(".length, -1).split(", ").map(Number);
    expect(stops.length).toBeLessThanOrEqual(33);
    expect(stops[0]).toBe(0);
    expect(stops.at(-1)).toBe(1);
    const duration = springSettleMs(SPRING[name]) / 1000;
    const segments = stops.length - 1;
    for (let i = 0; i <= 1000; i += 1) {
      const p = (i / 1000) * segments;
      const j = Math.min(segments - 1, Math.floor(p));
      const eased = stops[j]! + (stops[j + 1]! - stops[j]!) * (p - j);
      expect(Math.abs(eased - springState(SPRING[name], (i / 1000) * duration).x)).toBeLessThanOrEqual(0.005);
    }
  });

  it("retargets continuously in position and velocity", () => {
    const mid = springState(SPRING.surface, 0.08);
    const restarted = springState(SPRING.surface, 0, { x0: mid.x, v0: mid.v });
    expect(restarted.x).toBeCloseTo(mid.x, 10);
    expect(restarted.v).toBeCloseTo(mid.v, 10);
    const after = springState(SPRING.surface, 0.05, { x0: mid.x, v0: mid.v });
    expect(after.x).toBeCloseTo(springState(SPRING.surface, 0.13).x, 10);
  });
});
