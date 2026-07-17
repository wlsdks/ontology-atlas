import { describe, expect, it } from "vitest";

import { projectFlickLanding } from "./momentum";

/**
 * Spec for `projectFlickLanding` — ported from the prototype's `releaseDrag()`
 * momentum branch. `projectFlickLanding` currently throws (unimplemented) so
 * every test below is RED until the lead implements it against this file.
 */
const DECAY = 0.998; // --topology-v2-camera-momentum-decay

describe("projectFlickLanding", () => {
  it("matches the exact prototype formula for a rightward flick (vx=0.5px/ms, scale=1)", () => {
    // d = 0.998; projMsX = (0.5*1000)*0.998/(1-0.998)/1000 = (500*0.998/0.002)/1000
    //          = (500*499)/1000 = 249.5
    // worldVX  = -0.5/1*1000 = -500
    // landingX = 100 + (-249.5*60)/1 = 100 - 14970 = -14870
    const result = projectFlickLanding({
      velocityPxPerMs: 0.5,
      cameraPosition: 100,
      cameraScale: 1,
      decay: DECAY,
    });

    expect(result.worldVelocity).toBeCloseTo(-500, 6);
    expect(result.landingTarget).toBeCloseTo(-14870, 3);
  });

  it("matches the exact prototype formula for a leftward flick (vy=-0.2px/ms, scale=1)", () => {
    // projMsY = (-0.2*1000)*0.998/0.002/1000 = (-200*499)/1000 = -99.8
    // worldVY = -(-0.2)/1*1000 = 200
    // landingY = 50 + (-(-99.8)*60)/1 = 50 + 5988 = 6038
    const result = projectFlickLanding({
      velocityPxPerMs: -0.2,
      cameraPosition: 50,
      cameraScale: 1,
      decay: DECAY,
    });

    expect(result.worldVelocity).toBeCloseTo(200, 6);
    expect(result.landingTarget).toBeCloseTo(6038, 2);
  });

  it("scales the landing projection inversely with camera scale", () => {
    // Same velocity/position as the first case but scale=2 halves both the
    // worldVelocity and the projected landing offset from cameraPosition.
    const atScale1 = projectFlickLanding({
      velocityPxPerMs: 0.5,
      cameraPosition: 0,
      cameraScale: 1,
      decay: DECAY,
    });
    const atScale2 = projectFlickLanding({
      velocityPxPerMs: 0.5,
      cameraPosition: 0,
      cameraScale: 2,
      decay: DECAY,
    });

    expect(atScale2.worldVelocity).toBeCloseTo(atScale1.worldVelocity / 2, 6);
    expect(atScale2.landingTarget).toBeCloseTo(atScale1.landingTarget / 2, 3);
  });

  it("returns zero landing offset and velocity for a zero-velocity release", () => {
    const result = projectFlickLanding({
      velocityPxPerMs: 0,
      cameraPosition: 42,
      cameraScale: 1,
      decay: DECAY,
    });

    expect(result.worldVelocity).toBe(0);
    expect(result.landingTarget).toBe(42);
  });
});
