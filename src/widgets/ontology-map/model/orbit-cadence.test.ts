import { describe, expect, it } from "vitest";

import { followOrbitTarget, ORBIT_SPREAD_MAX_FRAMES, startOrbitCadence } from "./orbit-cadence";

function drive(targets: number[], reducedMotion = false): number[] {
  const pose = { yaw: targets[0], pitch: 0, yawTarget: targets[0], pitchTarget: 0 };
  const cadence = startOrbitCadence(pose.yawTarget, pose.pitchTarget);
  return targets.map((target) => {
    pose.yawTarget = target;
    pose.pitchTarget = -target / 2;
    followOrbitTarget(pose, cadence, reducedMotion);
    expect(pose.pitch).toBeCloseTo(-pose.yaw / 2, 12);
    return pose.yaw;
  });
}

function steps(values: number[]): number[] {
  return values.slice(1).map((value, index) => value - values[index]);
}

const SIXTY_HZ_ON_120 = Array.from({ length: 40 }, (_, frame) => Math.floor(frame / 2));

describe("orbit cadence", () => {
  it("spreads a 60 Hz pointer over every frame of a 120 Hz display, half a step behind at most", () => {
    const yaw = drive(SIXTY_HZ_ON_120);
    expect(steps(yaw).slice(8).every((step) => Math.abs(step - 0.5) < 1e-12)).toBe(true);
    expect(Math.max(...yaw.map((value, frame) => SIXTY_HZ_ON_120[frame] - value))).toBeLessThanOrEqual(0.5);
  });

  it("follows a pointer that keeps pace with the display exactly", () => {
    const targets = Array.from({ length: 30 }, (_, frame) => frame * 3);
    expect(drive(targets)).toEqual(targets);
  });

  it("follows the pointer exactly under reduced motion", () => {
    expect(drive(SIXTY_HZ_ON_120, true)).toEqual(SIXTY_HZ_ON_120);
  });

  it("lands the first move after a pause at once", () => {
    const paused = Array.from({ length: ORBIT_SPREAD_MAX_FRAMES + 2 }, () => 4);
    expect(drive([0, 0, 1, 1, 2, 2, 3, 3, 4, ...paused, 9]).at(-1)).toBe(9);
  });

  it("never passes the pointer", () => {
    const targets = [0, 0, 2, 2, 3, 3, 3, 3, 3, 3];
    const yaw = drive(targets);
    expect(yaw.every((value, frame) => value <= targets[frame])).toBe(true);
    expect(yaw.at(-1)).toBe(3);
  });
});
