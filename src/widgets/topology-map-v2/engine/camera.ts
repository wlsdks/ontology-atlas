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
 *
 * FIX (QA first-light pass, blocker 1 — "drag makes everything vanish"): the
 * prototype's elastic pan-bounds clamp (`updateCamera()`'s `< panBounds.minX`
 * branch, `docs/prototypes/topology-b2plus.html` lines 906-915) was left as a
 * `test.todo` when `stepCamera`/`momentum.ts` first landed — genuinely
 * undecided whether this module or a separate one should own it. Without it,
 * `momentum.ts`'s intentionally aggressive flick projection (its own test
 * pins a landing target of -14870 world units for a modest 0.5px/ms flick at
 * scale=1) is safe in the prototype ONLY because this per-frame clamp reins
 * the camera back toward the graph's own bounds every frame; the v2 port had
 * the projection but not the compensating clamp, so a single realistic
 * pan/flick release genuinely arrived at that huge target and stranded the
 * camera in blank canvas (repro: chrome-devtools pointerdown/move/up with
 * ~30ms spacing over ~220px — only "Fit to entire map"/fitViewToken recovered
 * it). `panBounds`/`isDragging` are optional so existing call sites (and the
 * pre-existing scale-only tests above) keep working unchanged when omitted.
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

export interface PanBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface CameraStepInput {
  camera: CameraAxes;
  target: CameraTarget;
  /** Elapsed seconds since the last frame, already clamped by the caller (≤ 0.05s in the prototype). */
  dt: number;
  /** ζ for x/y this frame — 1.0 normally, 0.82 right after a flick release. */
  damping: number;
  /**
   * ω, rad/s. Dive-zoom fix split the one shared token into
   * `--topology-v2-camera-spring-angfreq-interactive` (live wheel gesture —
   * scale axis + pan while wheel-zooming) and `-transition` (programmatic
   * camera moves — focus dive, deselect, Auto-arrange, fit-view); the caller
   * (`ui/topology-physics-step.ts`) picks which one this frame passes in.
   */
  angularFrequency: number;
  /** `--topology-v2-camera-scale-min` (0.24 in the prototype). */
  scaleMin: number;
  /** `--topology-v2-camera-scale-max` (2.6 in the prototype). */
  scaleMax: number;
  /** World-space soft pan limits (world bounds + margin) — omit to skip the elastic clamp entirely (e.g. before the world is built). */
  panBounds?: PanBounds;
  /** True while the pointer is actively dragging — the prototype's `updateCamera()` returns before ever reaching the clamp during a live drag, so the 1:1 tracking contract (`topology-pointer-handlers.ts`) never fights it. */
  isDragging?: boolean;
}

/**
 * Advances the full camera (x, y, scale) by one frame. Scale is always
 * critically damped (ζ=1.0 in the prototype, independent of the x/y
 * `damping` passed in — see `updateCamera()`: `stepSpring(camera.scale, ...,
 * 1.0)` is hardcoded even during a flick). The result's `scale` is clamped to
 * `[scaleMin, scaleMax]` after the spring step, and — when `panBounds` is
 * given and the pointer isn't actively dragging — x/y are elastically pulled
 * back toward `panBounds` (prototype: 14%/frame pull, 15% velocity bleed).
 */
const SCALE_CRITICAL_DAMPING = 1.0;
/**
 * The rubber-band return is **proportional to time** (code review fix, 2026-07-28).
 *
 * The prototype pulled 14% per frame and bled 15% of the velocity — values that
 * assume 60Hz, so **the feel diverges with the display's refresh rate**: at 120Hz
 * (ProMotion) it pulls twice as much in the same time and feels stiff, while
 * dropping to 30fps pulls half as much and feels slack. Not divergence but a matter
 * of feel — yet every other visual ramp in this repository is already of the form
 * `1-exp(-dt/τ)`, leaving only this one frame-dependent (the same species as fixing
 * `NODE_DRAG_HEAT_MS` from a frame count to ms).
 *
 * τ is derived **so that it matches the old value exactly at 60Hz** — that refresh
 * rate's feel is the reference and every other rate is aligned to it.
 * τ is back-computed from the old value rather than written as a decimal: a
 * hand-rounded constant diverges slightly from the old feel even at 60Hz (measured:
 * disagreeing at the fifth digit), and the next person cannot read where that
 * divergence came from.
 */
const REFERENCE_FRAME_SECONDS = 1 / 60;
/** Prototype `updateCamera()` — 14% return per frame at 60Hz. */
const PAN_BOUNDS_PULL_PER_REFERENCE_FRAME = 0.14;
/** Prototype `updateCamera()` — 15% velocity decay per frame at 60Hz. */
const PAN_BOUNDS_VELOCITY_RETENTION_PER_REFERENCE_FRAME = 0.85;
const PAN_BOUNDS_PULL_TAU_SECONDS =
  -REFERENCE_FRAME_SECONDS / Math.log(1 - PAN_BOUNDS_PULL_PER_REFERENCE_FRAME);
const PAN_BOUNDS_VELOCITY_TAU_SECONDS =
  -REFERENCE_FRAME_SECONDS / Math.log(PAN_BOUNDS_VELOCITY_RETENTION_PER_REFERENCE_FRAME);

/**
 * Prototype `panBounds = bbox(allNodes, 320)` (`docs/prototypes/topology-
 * b2plus.html` line 602) — generous slack past the world's own node bbox.
 * No assigned `--topology-v2-*` token yet (same "no token" precedent as
 * `topology-pointer-handlers.ts`'s `RIPPLE_PER_NEIGHBOR_DELAY_MS`).
 */
const DEFAULT_PAN_BOUNDS_MARGIN = 320;

/** Expands a world-space bounding box by `margin` on every side — the soft pan-bounds envelope. */
export function computePanBounds(
  worldBounds: PanBounds,
  margin: number = DEFAULT_PAN_BOUNDS_MARGIN,
): PanBounds {
  return {
    minX: worldBounds.minX - margin,
    minY: worldBounds.minY - margin,
    maxX: worldBounds.maxX + margin,
    maxY: worldBounds.maxY + margin,
  };
}

/**
 * Hard-clamps a single world-space point into `panBounds` — used to cap a
 * flick's projected landing target (`topology-pointer-handlers.ts`) so the
 * spring is never asked to chase a point far outside the graph's content.
 * (The softer, per-frame `clampAxisToPanBounds` below handles the *live*
 * camera position elastically; this one is a hard ceiling on the *target*.)
 */
export function clampPointToPanBounds(
  x: number,
  y: number,
  panBounds: PanBounds,
): { x: number; y: number } {
  return {
    x: Math.min(panBounds.maxX, Math.max(panBounds.minX, x)),
    y: Math.min(panBounds.maxY, Math.max(panBounds.minY, y)),
  };
}

function clampAxisToPanBounds(
  axis: SpringAxisState,
  min: number,
  max: number,
  dt: number,
): SpringAxisState {
  if (axis.value >= min && axis.value <= max) return axis;
  const target = Math.min(max, Math.max(min, axis.value));
  const pull = 1 - Math.exp(-dt / PAN_BOUNDS_PULL_TAU_SECONDS);
  const retention = Math.exp(-dt / PAN_BOUNDS_VELOCITY_TAU_SECONDS);
  return {
    value: axis.value + (target - axis.value) * pull,
    velocity: axis.velocity * retention,
  };
}

export function stepCamera(input: CameraStepInput): CameraAxes {
  const { camera, target, dt, damping, angularFrequency, scaleMin, scaleMax, panBounds, isDragging } = input;
  let x = stepSpring(camera.x, target.tx, dt, angularFrequency, damping);
  let y = stepSpring(camera.y, target.ty, dt, angularFrequency, damping);
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

  if (panBounds && !isDragging) {
    x = clampAxisToPanBounds(x, panBounds.minX, panBounds.maxX, dt);
    y = clampAxisToPanBounds(y, panBounds.minY, panBounds.maxY, dt);
  }

  return { x, y, scale };
}
