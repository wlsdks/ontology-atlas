import { describe, expect, it } from "vitest";

import { initWardingFit, stepWardingFit, WARDING_REFIT_MS } from "./realm-warding-fit";

describe("realm-warding-fit eases the ward radius refit", () => {
  it("starts settled on the given radius (no tween)", () => {
    const s = initWardingFit(100);
    expect(s.value).toBe(100);
    // Unchanged target → hold the value; no continuous animation.
    const next = stepWardingFit(s, 100, 1000, false);
    expect(next.value).toBe(100);
    expect(next).toBe(s); // same reference too — nothing reallocated
  });

  it("converges with a 240 ms ease when the visible set (target radius) changes", () => {
    let s = initWardingFit(100);
    // Target jumps to 300 at t=0 → the tween starts from the current 100.
    s = stepWardingFit(s, 300, 0, false);
    expect(s.value).toBe(100); // the first frame is still the start point
    // Midway (120 ms) — between 100 and 300.
    const mid = stepWardingFit(s, 300, WARDING_REFIT_MS / 2, false);
    expect(mid.value).toBeGreaterThan(100);
    expect(mid.value).toBeLessThan(300);
    // End (240 ms+) — snap to target and settle.
    const end = stepWardingFit(mid, 300, WARDING_REFIT_MS + 1, false);
    expect(end.value).toBeCloseTo(300, 6);
    expect(end.startMs).toBeLessThan(0);
  });

  it("snaps to the target at once under reduced motion (no journey)", () => {
    const s = initWardingFit(100);
    const snapped = stepWardingFit(s, 300, 0, true);
    expect(snapped.value).toBe(300);
    expect(snapped.startMs).toBeLessThan(0);
  });

  it("does not restart the tween for a change within the dead band", () => {
    const s = initWardingFit(100);
    const next = stepWardingFit(s, 100.2, 500, false);
    // Stays settled — value unchanged.
    expect(next.value).toBe(100);
  });

  it("starts a new tween from the current rendered value when the target changes mid-ease", () => {
    let s = initWardingFit(100);
    s = stepWardingFit(s, 300, 0, false);
    const mid = stepWardingFit(s, 300, WARDING_REFIT_MS / 2, false);
    const midValue = mid.value;
    // Changing the target to 500 restarts from midValue.
    const restart = stepWardingFit(mid, 500, WARDING_REFIT_MS / 2, false);
    expect(restart.from).toBeCloseTo(midValue, 6);
    expect(restart.to).toBe(500);
  });
});
