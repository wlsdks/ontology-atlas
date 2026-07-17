import { describe, expect, it } from "vitest";

import { projectFlickLanding, sampleReleaseVelocity } from "./momentum";

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

const WINDOW_MS = 80; // --topology-v2-camera-release-velocity-window-ms
const MIN_SPEED = 0.05; // --topology-v2-camera-flick-min-speed (px/ms)

describe("sampleReleaseVelocity — 정지 릴리스 게이트 (iOS scroll rule)", () => {
  it("registers a flick when the pointer was moving right up to release", () => {
    // 5 samples ~16ms apart, moving +8px/frame → ~0.5px/ms, released at t=64.
    const history = [
      { x: 0, y: 0, t: 0 },
      { x: 8, y: 0, t: 16 },
      { x: 16, y: 0, t: 32 },
      { x: 24, y: 0, t: 48 },
      { x: 32, y: 0, t: 64 },
    ];
    const result = sampleReleaseVelocity({
      history,
      releaseTime: 64,
      windowMs: WINDOW_MS,
      minSpeedPxPerMs: MIN_SPEED,
    });
    expect(result.isFlick).toBe(true);
    expect(result.vx).toBeCloseTo(0.5, 6);
    expect(result.vy).toBe(0);
  });

  it("gates to zero when the pointer stopped and was held before release (owner spec)", () => {
    // Same fast drag, but the last sample is 500ms before release — the user
    // dragged, stopped, held, then lifted. No sample within the 80ms window.
    const history = [
      { x: 0, y: 0, t: 0 },
      { x: 8, y: 0, t: 16 },
      { x: 16, y: 0, t: 32 },
      { x: 24, y: 0, t: 48 },
      { x: 32, y: 0, t: 64 },
    ];
    const result = sampleReleaseVelocity({
      history,
      releaseTime: 564, // 500ms after the last move
      windowMs: WINDOW_MS,
      minSpeedPxPerMs: MIN_SPEED,
    });
    expect(result.isFlick).toBe(false);
    expect(result.vx).toBe(0);
    expect(result.vy).toBe(0);
  });

  it("gates to zero for a slow crawl below the min-speed threshold", () => {
    // Moving 0.5px/frame ≈ 0.03px/ms — under the 0.05 threshold → hold in place.
    const history = [
      { x: 0, y: 0, t: 0 },
      { x: 0.5, y: 0, t: 16 },
      { x: 1, y: 0, t: 32 },
      { x: 1.5, y: 0, t: 48 },
      { x: 2, y: 0, t: 64 },
    ];
    const result = sampleReleaseVelocity({
      history,
      releaseTime: 64,
      windowMs: WINDOW_MS,
      minSpeedPxPerMs: MIN_SPEED,
    });
    expect(result.isFlick).toBe(false);
    expect(result.vx).toBe(0);
    expect(result.vy).toBe(0);
  });

  it("ignores an earlier fast segment once the pointer stops and holds (window excludes it)", () => {
    // Fast drag (t=0..32), then held stationary for ~150ms with events still
    // firing at the same coordinate, then released at t=180. The 80ms window
    // (t≥100) contains only the stationary tail → hold, even though the whole
    // gesture had a fast start. This is the "드래그 후 멈추면 그 자리에 정지" case
    // on a device that keeps emitting pointermove while the finger is held.
    const history = [
      { x: 0, y: 0, t: 0 },
      { x: 40, y: 0, t: 16 },
      { x: 80, y: 0, t: 32 }, // fast — but >80ms before release
      { x: 80, y: 0, t: 100 }, // stopped and held
      { x: 80, y: 0, t: 140 },
      { x: 80, y: 0, t: 180 },
    ];
    const result = sampleReleaseVelocity({
      history,
      releaseTime: 180,
      windowMs: WINDOW_MS,
      minSpeedPxPerMs: MIN_SPEED,
    });
    expect(result.isFlick).toBe(false);
    expect(result.vx).toBe(0);
  });

  it("returns hold when there are fewer than two samples in the window", () => {
    const result = sampleReleaseVelocity({
      history: [{ x: 10, y: 10, t: 0 }],
      releaseTime: 200,
      windowMs: WINDOW_MS,
      minSpeedPxPerMs: MIN_SPEED,
    });
    expect(result.isFlick).toBe(false);
    expect(result.vx).toBe(0);
    expect(result.vy).toBe(0);
  });
});
