import { describe, expect, it } from "vitest";

import { clampPointToPanBounds, computePanBounds, stepCamera, type CameraAxes } from "./camera";
import { stepSpring } from "./spring";

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

  // Regression (QA first-light pass): the prototype's elastic pan-bounds
  // clamp (`updateCamera()`'s `< panBounds.minX` branch, 0.14 pull factor +
  // 0.85 velocity damping, `docs/prototypes/topology-b2plus.html` lines
  // 906-915) was never ported when `stepCamera`/`momentum.ts` landed —
  // `momentum.test.ts` even pins a landing target of -14870 world units for
  // a modest 0.5px/ms flick at scale=1. In the prototype that huge target is
  // harmless because this per-frame clamp reins the camera back toward
  // `panBounds` every frame; without it, v2's spring genuinely arrives at
  // that landing target and strands the camera off in blank canvas after a
  // single realistic drag/flick — reproduced manually via chrome-devtools
  // (any ~200px pan release sent the camera fully off-screen; only "지도
  // 전체 맞추기" (fit view) recovered it).
  describe("panBounds — elastic clamp (prototype updateCamera() pan-bounds branch)", () => {
    const panBounds = { minX: -100, minY: -100, maxX: 100, maxY: 100 };

    it("leaves the camera untouched while inside panBounds (at rest, no residual spring velocity)", () => {
      const result = stepCamera({
        camera: { ...restCamera, x: { value: 50, velocity: 0 }, y: { value: -20, velocity: 0 } },
        target: { tx: 50, ty: -20, tscale: 1 },
        dt: DT_60FPS,
        damping: 1.0,
        angularFrequency: ANGULAR_FREQUENCY,
        scaleMin: SCALE_MIN,
        scaleMax: SCALE_MAX,
        panBounds,
        isDragging: false,
      });

      expect(result.x.value).toBeCloseTo(50, 5);
      expect(result.y.value).toBeCloseTo(-20, 5);
    });

    it("pulls the camera back by 14%/frame and bleeds 15% of velocity once it strays past panBounds", () => {
      // Spring target is intentionally far away too (mirrors a post-flick
      // landing target) — the spring step alone would keep moving toward
      // -500; the clamp must still rein the *result* back toward the bound.
      const strandedFarAway: CameraAxes = {
        ...restCamera,
        x: { value: 500, velocity: 40 },
      };

      const result = stepCamera({
        camera: strandedFarAway,
        target: { tx: 500, ty: 0, tscale: 1 },
        dt: DT_60FPS,
        damping: 1.0,
        angularFrequency: ANGULAR_FREQUENCY,
        scaleMin: SCALE_MIN,
        scaleMax: SCALE_MAX,
        panBounds,
        isDragging: false,
      });

      // Stepped x before clamping stays ~500 (spring already at its target,
      // residual velocity nudges it a hair further); clamp then pulls ~14%
      // of the way from ~500 back toward the nearest bound (100): roughly
      // 500 + (100-500)*0.14 ≈ 444.
      expect(result.x.value).toBeGreaterThan(430);
      expect(result.x.value).toBeLessThan(460);
      // Velocity bleed is 15% of whatever the underlying spring step itself
      // produced (not the original 40 — the spring's own critically-damped
      // decay already reduces it before the clamp bleeds another 15%).
      const preClampVelocity = stepSpring({ value: 500, velocity: 40 }, 500, DT_60FPS, ANGULAR_FREQUENCY, 1.0).velocity;
      expect(result.x.velocity).toBeCloseTo(preClampVelocity * 0.85, 5);
    });


    /**
     * **The same amount comes back in the same time at any refresh rate** (2026-07-28).
     *
     * The old rubber band pulled 14% per frame and bled 15% of the velocity — values
     * that assume 60Hz, so at 120Hz (ProMotion) it pulls twice as much in the same
     * time and feels stiff, while dropping to 30fps pulls half as much and feels
     * slack. Not divergence but a matter of **feel** — yet every other visual ramp in
     * this engine is already of the form `1-exp(-dt/τ)`, leaving only this one
     * frame-dependent.
     *
     * The assertion is made on **elapsed time**, not "how many frames" — that is
     * precisely the axis the old implementation could not hold.
     */
    it("복귀가 주사율이 아니라 시간을 따른다 — 60Hz 와 120Hz 가 같은 곳에 도착한다", () => {
      const elapsedSeconds = 0.2;
      const run = (frameSeconds: number) => {
        let camera: CameraAxes = { ...restCamera, x: { value: 500, velocity: 40 } };
        const frames = Math.round(elapsedSeconds / frameSeconds);
        for (let i = 0; i < frames; i += 1) {
          camera = stepCamera({
            camera,
            target: { tx: 500, ty: 0, tscale: 1 },
            dt: frameSeconds,
            damping: 1.0,
            angularFrequency: ANGULAR_FREQUENCY,
            scaleMin: SCALE_MIN,
            scaleMax: SCALE_MAX,
            panBounds,
            isDragging: false,
          });
        }
        return camera.x.value;
      };

      const at60 = run(1 / 60);
      const at120 = run(1 / 120);
      const at30 = run(1 / 30);

      // A difference the size of the integration error remains, but the old
      // implementation diverged by a **multiple** (120Hz ran twice the frames of
      // 60Hz and pulled that much more).
      expect(at120).toBeCloseTo(at60, 0);
      expect(at30).toBeCloseTo(at60, 0);
    });

    it("does not apply the clamp while the pointer is actively dragging (1:1 tracking must not fight the clamp)", () => {
      const strandedFarAway: CameraAxes = {
        ...restCamera,
        x: { value: 500, velocity: 0 },
      };

      const result = stepCamera({
        camera: strandedFarAway,
        target: { tx: 500, ty: 0, tscale: 1 },
        dt: DT_60FPS,
        damping: 1.0,
        angularFrequency: ANGULAR_FREQUENCY,
        scaleMin: SCALE_MIN,
        scaleMax: SCALE_MAX,
        panBounds,
        isDragging: true,
      });

      expect(result.x.value).toBeCloseTo(500, 5);
    });

    it("is a no-op (backward compatible) when panBounds is omitted", () => {
      const result = stepCamera({
        camera: { ...restCamera, x: { value: 5000, velocity: 0 } },
        target: { tx: 5000, ty: 0, tscale: 1 },
        dt: DT_60FPS,
        damping: 1.0,
        angularFrequency: ANGULAR_FREQUENCY,
        scaleMin: SCALE_MIN,
        scaleMax: SCALE_MAX,
      });

      expect(result.x.value).toBeCloseTo(5000, 5);
    });
  });
});

// Regression (QA first-light pass, blocker 1 continued): the per-frame
// elastic clamp above is NOT sufficient on its own. `momentum.ts`'s flick
// projection sets `cameraTarget.tx/ty` to an absurdly distant, FIXED value
// (its own test: -14870 world units for a routine 0.5px/ms flick at
// scale=1) — every frame the spring's restoring force is proportional to the
// remaining distance to that fixed target, so it keeps pushing the camera
// back out faster than a flat 14%/frame pull can rein it in. Manually
// verified via chrome-devtools: even 5+ seconds after a release, the camera
// never recovered. The robust fix is to also clamp the *target itself* at
// the moment it's set (`topology-pointer-handlers.ts`'s `handlePointerUp`),
// so the spring is never asked to chase an unreachable point in the first
// place. `computePanBounds`/`clampPointToPanBounds` are the shared pure
// pieces both that call site and `topology-physics-step.ts` build on.
describe("computePanBounds / clampPointToPanBounds", () => {
  it("expands world bounds by the given margin on every side", () => {
    const bounds = computePanBounds({ minX: -100, minY: -50, maxX: 100, maxY: 50 }, 320);

    expect(bounds).toEqual({ minX: -420, minY: -370, maxX: 420, maxY: 370 });
  });

  it("leaves an in-bounds point untouched", () => {
    const panBounds = computePanBounds({ minX: -100, minY: -100, maxX: 100, maxY: 100 }, 320);

    expect(clampPointToPanBounds(50, -40, panBounds)).toEqual({ x: 50, y: -40 });
  });

  it("clamps a wildly out-of-bounds point (e.g. a runaway flick landing target) to the nearest edge", () => {
    const panBounds = computePanBounds({ minX: -100, minY: -100, maxX: 100, maxY: 100 }, 320);

    expect(clampPointToPanBounds(36527, -14870, panBounds)).toEqual({ x: 420, y: -420 });
  });
});
