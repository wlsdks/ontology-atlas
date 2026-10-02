import { describe, expect, it } from "vitest";

import { stepCamera, type CameraAxes } from "./camera";
import { projectFlickLanding, sampleReleaseVelocity } from "./momentum";

const TAU_MS = 180;

describe("projectFlickLanding", () => {
  it("lands one time constant of release velocity away, against the drag", () => {
    const result = projectFlickLanding({ velocityPxPerMs: 0.5, cameraPosition: 100, cameraScale: 1, timeConstantMs: TAU_MS });
    expect(result.worldVelocity).toBeCloseTo(-500, 6);
    expect(result.landingTarget).toBeCloseTo(100 - 0.5 * TAU_MS, 6);
  });

  it("is proportional to the release velocity and inverse to the camera scale", () => {
    const base = projectFlickLanding({ velocityPxPerMs: 0.4, cameraPosition: 0, cameraScale: 1, timeConstantMs: TAU_MS });
    const half = projectFlickLanding({ velocityPxPerMs: 0.2, cameraPosition: 0, cameraScale: 1, timeConstantMs: TAU_MS });
    const zoomed = projectFlickLanding({ velocityPxPerMs: 0.4, cameraPosition: 0, cameraScale: 2, timeConstantMs: TAU_MS });
    expect(half.landingTarget).toBeCloseTo(base.landingTarget / 2, 9);
    expect(zoomed.landingTarget).toBeCloseTo(base.landingTarget / 2, 9);
    expect(zoomed.worldVelocity).toBeCloseTo(base.worldVelocity / 2, 9);
  });

  it("returns zero landing offset and velocity for a zero-velocity release", () => {
    const result = projectFlickLanding({ velocityPxPerMs: 0, cameraPosition: 42, cameraScale: 1, timeConstantMs: TAU_MS });
    expect(Object.is(result.worldVelocity, 0)).toBe(true);
    expect(result.landingTarget).toBe(42);
  });

  it("glides like friction under a critically damped spring of the same time constant: no overshoot, release speed kept", () => {
    const velocityPxPerMs = 2;
    const landing = projectFlickLanding({ velocityPxPerMs, cameraPosition: 0, cameraScale: 1, timeConstantMs: TAU_MS });
    let camera: CameraAxes = {
      x: { value: 0, velocity: landing.worldVelocity },
      y: { value: 0, velocity: 0 },
      scale: { value: 1, velocity: 0 },
    };
    const dt = 1 / 240;
    let farthest = 0;
    const firstStep = stepCamera({
      camera,
      target: { tx: landing.landingTarget, ty: 0, tscale: 1 },
      dt,
      damping: 1,
      angularFrequency: 1000 / TAU_MS,
      scaleMin: 0.1,
      scaleMax: 10,
    });
    expect(firstStep.x.velocity / landing.worldVelocity).toBeCloseTo(Math.exp((-dt * 1000) / TAU_MS), 2);
    for (let i = 0; i < 2400; i += 1) {
      camera = stepCamera({
        camera,
        target: { tx: landing.landingTarget, ty: 0, tscale: 1 },
        dt,
        damping: 1,
        angularFrequency: 1000 / TAU_MS,
        scaleMin: 0.1,
        scaleMax: 10,
      });
      farthest = Math.min(farthest, camera.x.value);
    }
    expect(farthest).toBeGreaterThanOrEqual(landing.landingTarget - 1e-6);
    expect(camera.x.value).toBeCloseTo(-velocityPxPerMs * TAU_MS, 1);
  });
});

const WINDOW_MS = 80; // --map-camera-release-velocity-window-ms
const MIN_SPEED = 0.05; // --map-camera-flick-min-speed (px/ms)

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
    // gesture had a fast start. This is the 「Stop in place after dragging」 case
    // (after dragging, stopping stops it right there) on a device that keeps
    // emitting pointermove while the finger is held.
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
