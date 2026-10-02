import { describe, expect, it } from "vitest";

import { applyHaze, createHazeState, hazeFactor, hazeWindowStart, stepHaze } from "./cosmos-ambient";
import type { GalaxyPose } from "./cosmos-types";
import type { CosmosLayout } from "./layout/cosmos-layout";

const layout = { galaxies: [{ id: "domain-a", spin: 1 }, { id: "domain-b", spin: -1 }] } as unknown as CosmosLayout;

function poses(): GalaxyPose[] {
  return layout.galaxies.map(() => ({ x: 0, y: 0, theta: 0, wispTheta: 0, wispLight: 1, presence: 1, condense: 1 }));
}

function run(state: ReturnType<typeof createHazeState>, from: number, to: number, windowStart: number): boolean {
  let awake = false;
  for (let now = from; now <= to; now += 16) awake = stepHaze(state, { now, dt: 16, windowStart, reducedMotion: false, visible: true });
  return awake;
}

describe("cosmos haze", () => {
  it("runs at full speed for ten seconds after the window opens, then ramps to rest at twelve", () => {
    expect(hazeFactor(5_000 + 9_999, 5_000)).toBe(1);
    expect(hazeFactor(5_000 + 11_000, 5_000)).toBeCloseTo(0.5, 12);
    expect(hazeFactor(5_000 + 12_000, 5_000)).toBe(0);
  });

  it("opens the window at the later of the last input and the end of arrival", () => {
    expect(hazeWindowStart(4_000, 1_120)).toBe(4_000);
    expect(hazeWindowStart(300, 1_120)).toBe(1_120);
    const state = createHazeState();
    expect(stepHaze(state, { now: 12_500, dt: 16, windowStart: 0, arrivalEnd: 1_120, reducedMotion: false, visible: true })).toBe(true);
    expect(stepHaze(state, { now: 13_200, dt: 16, windowStart: 0, arrivalEnd: 1_120, reducedMotion: false, visible: true })).toBe(false);
  });

  it("wakes exactly where it went to sleep", () => {
    const state = createHazeState();
    expect(run(state, 0, 13_000, 0)).toBe(false);
    const before = poses();
    applyHaze(layout, state, before, 1);
    expect(stepHaze(state, { now: 40_000, dt: 64, windowStart: 40_000, reducedMotion: false, visible: true })).toBe(true);
    const after = poses();
    applyHaze(layout, state, after, 1);
    after.forEach((pose, i) => {
      expect(Math.abs(pose.wispTheta - before[i]!.wispTheta)).toBeLessThan(1e-9);
      expect(Math.abs(pose.wispLight - before[i]!.wispLight)).toBeLessThan(1e-9);
      expect(pose.theta).toBe(0);
    });
    run(state, 40_016, 41_000, 40_000);
    const moved = poses();
    applyHaze(layout, state, moved, 1);
    expect(moved[0]!.wispTheta).not.toBe(after[0]!.wispTheta);
  });

  it("draws no haze under reduced motion", () => {
    const state = createHazeState();
    expect(stepHaze(state, { now: 500, dt: 16, windowStart: 0, reducedMotion: true, visible: true })).toBe(false);
    expect(state.factor).toBe(0);
    const reduced = poses();
    applyHaze(layout, state, reduced, 1, true);
    for (const pose of reduced) expect(pose).toMatchObject({ theta: 0, wispTheta: 0, wispLight: 1 });
  });
});
