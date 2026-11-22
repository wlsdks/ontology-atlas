import { describe, expect, it } from "vitest";

import { DOME_PITCH_MAX } from "./orbit";
import { stepOrbitRelease } from "./orbit-release";

function pose(overrides: Partial<Parameters<typeof stepOrbitRelease>[0]> = {}) {
  return { yaw: 0, pitch: 0.5, yawVel: 0, pitchVel: 0, yawSnap: null, yawTarget: 0, pitchTarget: 0.5, ...overrides };
}

describe("stepOrbitRelease", () => {
  it("coasts on the release velocity, decays it and keeps the drag target on the pose", () => {
    const dome = pose({ yawVel: 0.001 });
    stepOrbitRelease(dome, 16);
    expect(dome.yaw).toBeCloseTo(0.016, 12);
    expect(dome.yawVel).toBeGreaterThan(0);
    expect(dome.yawVel).toBeLessThan(0.001);
    expect(dome.yawTarget).toBe(dome.yaw);
    expect(dome.pitchTarget).toBe(dome.pitch);
  });

  it("approaches a meridian landing exponentially, with the time constant clamped to 320 ms", () => {
    const dome = pose({ yawVel: 0.001, yawSnap: 1 });
    stepOrbitRelease(dome, 16);
    expect(dome.yaw).toBeCloseTo(1 - Math.exp(-16 / 320), 12);
    expect(dome.yawSnap).toBe(1);
    expect(dome.yawVel).toBeGreaterThan(0);
    expect(dome.yawVel).toBeLessThan(0.001);
  });

  it("lands exactly on the meridian once within arrival distance, clears the landing and stops", () => {
    const dome = pose({ yawVel: 0.001, yawSnap: 0.001 });
    stepOrbitRelease(dome, 16);
    expect(dome.yaw).toBe(0.001);
    expect(dome.yawSnap).toBeNull();
    expect(dome.yawVel).toBe(0);
  });

  it("springs a pitch pushed past the limit back toward it and drops its velocity", () => {
    const dome = pose({ pitch: DOME_PITCH_MAX + 0.2, pitchVel: 0.0001 });
    stepOrbitRelease(dome, 16);
    expect(dome.pitch).toBeGreaterThan(DOME_PITCH_MAX);
    expect(dome.pitch).toBeLessThan(DOME_PITCH_MAX + 0.2);
    expect(dome.pitchVel).toBe(0);
  });

  it("springs the pitch back the same way while carrying a meridian landing", () => {
    const dome = pose({ pitch: DOME_PITCH_MAX + 0.2, pitchVel: 0.0001, yawVel: 0.001, yawSnap: 1 });
    stepOrbitRelease(dome, 16);
    expect(dome.pitch).toBeGreaterThan(DOME_PITCH_MAX);
    expect(dome.pitch).toBeLessThan(DOME_PITCH_MAX + 0.2);
    expect(dome.pitchVel).toBe(0);
    expect(dome.pitchTarget).toBe(dome.pitch);
  });
});
