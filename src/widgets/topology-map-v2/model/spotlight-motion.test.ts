import { describe, expect, it } from "vitest";

import { SPOTLIGHT_DASH_PERIOD, stepSpotlightPhase } from "./spotlight-motion";

describe("stepSpotlightPhase", () => {
  it("moves only while the spotlight transition is settling", () => {
    const moved = stepSpotlightPhase({
      dashOffset: 0,
      settling: true,
      reducedMotion: false,
      dtSeconds: 1 / 60,
      speedPxPerMs: 0.012,
    });
    expect(moved).toBeCloseTo(0.2, 6);

    expect(
      stepSpotlightPhase({
        dashOffset: moved,
        settling: false,
        reducedMotion: false,
        dtSeconds: 1 / 60,
        speedPxPerMs: 0.012,
      }),
    ).toBe(moved);
  });

  it("snaps to a static phase under reduced motion", () => {
    expect(
      stepSpotlightPhase({
        dashOffset: 4,
        settling: true,
        reducedMotion: true,
        dtSeconds: 1 / 60,
        speedPxPerMs: 0.012,
      }),
    ).toBe(0);
  });

  it("wraps within the dash period and ignores invalid elapsed time", () => {
    expect(
      stepSpotlightPhase({
        dashOffset: 8.9,
        settling: true,
        reducedMotion: false,
        dtSeconds: 1,
        speedPxPerMs: 0.012,
      }),
    ).toBeCloseTo(2.9, 6);
    expect(
      stepSpotlightPhase({
        dashOffset: 1,
        settling: true,
        reducedMotion: false,
        dtSeconds: -1,
        speedPxPerMs: 0.012,
      }),
    ).toBe(1);
    expect(SPOTLIGHT_DASH_PERIOD).toBe(9);
  });
});
