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
 * DECISION (lead, 2026-07-18): v2 is self-contained on scale bounds — the
 * approved prototype's `0.24–2.6` (its own `--topology-v2-camera-scale-*`
 * tokens) win over `topology-map-canvas/lib/camera.ts`'s `0.25–3`. Reusing the
 * old `clampScale` would silently clamp v2 to the un-approved bounds, and the
 * module contract forbids cross-widget engine imports anyway. Bounds are
 * threaded as explicit parameters; the old widget keeps its own values until
 * P6 deletes it.
 */

import { stepSpring, type SpringAxisState } from "./spring";

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
const SCALE_CRITICAL_DAMPING = 1.0;

export function stepCamera(input: CameraStepInput): CameraAxes {
  const { camera, target, dt, damping, angularFrequency, scaleMin, scaleMax } = input;
  const x = stepSpring(camera.x, target.tx, dt, angularFrequency, damping);
  const y = stepSpring(camera.y, target.ty, dt, angularFrequency, damping);
  const steppedScale = stepSpring(
    camera.scale,
    target.tscale,
    dt,
    angularFrequency,
    SCALE_CRITICAL_DAMPING,
  );
  const scale: SpringAxisState = {
    value: Math.min(scaleMax, Math.max(scaleMin, steppedScale.value)),
    velocity: steppedScale.velocity,
  };
  return { x, y, scale };
}
