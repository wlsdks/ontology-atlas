/**
 * Camera composition — the B2+ prototype's `camera` object + `updateCamera()`
 * (`docs/prototypes/topology-b2plus.html` §8, §11), wiring together
 * `spring.ts` (per-axis critically-damped integration), `momentum.ts`
 * (flick-release landing projection) and `hysteresis.ts` (click-vs-drag
 * gate, consumed by `interaction/pointer-state-machine.ts`, not here).
 *
 * `docs/TOPOLOGY-V2-DESIGN.md` §1.3 mandates reusing
 * `src/widgets/topology-map-canvas/lib/camera.ts`'s pure functions —
 * `fitBounds`/`zoomAt`/`panBy`/`clampScale` — rather than reimplementing
 * fit-to-bounds geometry. This module's job is the *spring/momentum layer on
 * top* of that geometry: `fitBounds` computes a target `{tx, ty, k}`; this
 * module springs the live camera toward that target frame-by-frame.
 *
 * KNOWN AMBIGUITY (flag for the lead / design doc author, not silently
 * resolved here): `topology-map-canvas/lib/camera.ts`'s own `clampScale`
 * hardcodes `MAP_SCALE_MIN = 0.25` / `MAP_SCALE_MAX = 3`, but this widget's
 * own tokens (`--topology-v2-camera-scale-min` = 0.24, `--topology-v2-camera-scale-max`
 * = 2.6, taken from the prototype's `MIN_SCALE`/`MAX_SCALE`) disagree. Calling
 * the reused `clampScale` as-is would silently clamp v2's camera to the wrong
 * bounds. The lead needs to either (a) pass v2's bounds into a local clamp
 * instead of the reused one, or (b) reconcile the two token sets in a
 * follow-up design doc note. This file threads `scaleMin`/`scaleMax` as
 * explicit parameters (not reused from `topology-map-canvas`) so either path
 * stays open.
 *
 * STUB: the lead implements the body. See `camera.test.ts`.
 */

import type { SpringAxisState } from "./spring";

export interface CameraAxes {
  x: SpringAxisState;
  y: SpringAxisState;
  /** Camera scale, modeled as its own spring axis (prototype `camera.scale`/`vscale`). */
  scale: SpringAxisState;
}

export interface CameraTarget {
  tx: number;
  ty: number;
  tscale: number;
}

export interface CameraStepInput {
  camera: CameraAxes;
  target: CameraTarget;
  /** Elapsed seconds since the last frame, already clamped by the caller (≤ 0.05s in the prototype). */
  dt: number;
  /** ζ for x/y this frame — 1.0 normally, 0.82 right after a flick release. */
  damping: number;
  /** ω, rad/s — `--topology-v2-camera-spring-angfreq`. */
  angularFrequency: number;
  /** `--topology-v2-camera-scale-min` (0.24 in the prototype). */
  scaleMin: number;
  /** `--topology-v2-camera-scale-max` (2.6 in the prototype). */
  scaleMax: number;
}

/**
 * Advances the full camera (x, y, scale) by one frame. Scale is always
 * critically damped (ζ=1.0 in the prototype, independent of the x/y
 * `damping` passed in — see `updateCamera()`: `stepSpring(camera.scale, ...,
 * 1.0)` is hardcoded even during a flick). The result's `scale` is clamped to
 * `[scaleMin, scaleMax]` after the spring step.
 */
export function stepCamera(_input: CameraStepInput): CameraAxes {
  throw new Error(
    "TODO(lead): implement stepCamera per docs/TOPOLOGY-V2-DESIGN.md §1.3/§2.4 " +
      "and the prototype's updateCamera() — camera.test.ts pins the expected contract.",
  );
}
