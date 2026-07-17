import { describe, expect, it } from "vitest";

import { stepCamera, type CameraAxes } from "./camera";

/**
 * Spec for `stepCamera` — the per-frame composition of three `stepSpring`
 * axes (x, y, scale) plus scale clamping. Currently throws (unimplemented)
 * so every test below is RED until the lead implements it.
 */
const ANGULAR_FREQUENCY = 1 / 0.34;
const SCALE_MIN = 0.24; // --topology-v2-camera-scale-min
const SCALE_MAX = 2.6; // --topology-v2-camera-scale-max
const DT_60FPS = 1 / 60;

const restCamera: CameraAxes = {
  x: { value: 0, velocity: 0 },
  y: { value: 0, velocity: 0 },
  scale: { value: 1, velocity: 0 },
};

describe("stepCamera", () => {
  it("moves x/y/scale independently toward their own targets", () => {
    const result = stepCamera({
      camera: restCamera,
      target: { tx: 100, ty: -50, tscale: 1.5 },
      dt: DT_60FPS,
      damping: 1.0,
      angularFrequency: ANGULAR_FREQUENCY,
      scaleMin: SCALE_MIN,
      scaleMax: SCALE_MAX,
    });

    expect(result.x.value).toBeGreaterThan(0);
    expect(result.y.value).toBeLessThan(0);
    expect(result.scale.value).toBeGreaterThan(1);
  });

  it("clamps the resulting scale to [scaleMin, scaleMax] even if the spring would overshoot past it", () => {
    // A large target with an underdamped-like scenario (still ζ=1.0 here,
    // but starting velocity already pushing past the max) should still clamp.
    const overshooting: CameraAxes = {
      ...restCamera,
      scale: { value: 2.55, velocity: 50 }, // already moving fast toward/past MAX
    };

    const result = stepCamera({
      camera: overshooting,
      target: { tx: 0, ty: 0, tscale: 2.6 },
      dt: DT_60FPS,
      damping: 1.0,
      angularFrequency: ANGULAR_FREQUENCY,
      scaleMin: SCALE_MIN,
      scaleMax: SCALE_MAX,
    });

    expect(result.scale.value).toBeLessThanOrEqual(SCALE_MAX);
    expect(result.scale.value).toBeGreaterThanOrEqual(SCALE_MIN);
  });

  it("scale always uses critical damping (ζ=1.0) regardless of the x/y damping passed in", () => {
    // Prototype `updateCamera()`: `stepSpring(camera.scale, camera.vscale, camera.tscale, dt, angFreq, 1.0)`
    // is hardcoded to 1.0 even while camera.damping (x/y) is 0.82 post-flick.
    const withFlickDamping = stepCamera({
      camera: restCamera,
      target: { tx: 0, ty: 0, tscale: 2 },
      dt: DT_60FPS,
      damping: 0.82, // x/y only — scale must stay critically damped internally
      angularFrequency: ANGULAR_FREQUENCY,
      scaleMin: SCALE_MIN,
      scaleMax: SCALE_MAX,
    });
    const withCriticalDamping = stepCamera({
      camera: restCamera,
      target: { tx: 0, ty: 0, tscale: 2 },
      dt: DT_60FPS,
      damping: 1.0,
      angularFrequency: ANGULAR_FREQUENCY,
      scaleMin: SCALE_MIN,
      scaleMax: SCALE_MAX,
    });

    // Same starting state + same target + same dt → scale axis must evolve
    // identically regardless of the x/y damping argument.
    expect(withFlickDamping.scale.value).toBeCloseTo(withCriticalDamping.scale.value, 10);
    expect(withFlickDamping.scale.velocity).toBeCloseTo(withCriticalDamping.scale.velocity, 10);
  });

  it("does not mutate the input camera object", () => {
    const frozen = JSON.parse(JSON.stringify(restCamera));

    stepCamera({
      camera: restCamera,
      target: { tx: 10, ty: 10, tscale: 1.2 },
      dt: DT_60FPS,
      damping: 1.0,
      angularFrequency: ANGULAR_FREQUENCY,
      scaleMin: SCALE_MIN,
      scaleMax: SCALE_MAX,
    });

    expect(restCamera).toEqual(frozen);
  });

  // The prototype's elastic pan-bounds clamp (updateCamera(): the `< panBounds.minX`
  // branch, 0.14 pull factor + 0.85 velocity damping) has no assigned
  // `--topology-v2-*` token in design doc §2.4 — genuinely undecided whether
  // stepCamera owns this or a separate pan-bounds module does. Left as
  // test.todo rather than guessed.
  it.todo("clamps the camera position elastically against pan bounds (prototype 0.14/0.85 factors — no v2 token yet, needs design doc follow-up)");
});
