/**
 * Flick-release momentum projection — the iOS `UIScrollView` deceleration
 * projection (`docs/INTERACTION-DESIGN.md` §1 "Inertial Projection (v/1000)·d/(1−d)" —
 * momentum projection).
 *
 * When a pan drag is released with screen-space velocity `v` (px/ms, sampled
 * from the release-velocity window by `sampleReleaseVelocity`), the camera does
 * not stop instantly — it projects a landing target a distance PROPORTIONAL to
 * the release velocity and hands that target + a residual world-space velocity
 * to the spring (`engine/spring.ts`, `damping = 0.82` — see
 * `--topology-v2-camera-damping-flick`).
 *
 * FIX (owner + QA — "flick snaps to the pan-bounds edge instead of gliding
 * proportionately"): the prototype's port carried an extra `* 60` factor
 * (`landing = pos + (-projMs * 60)/scale`) that inflated the projected distance
 * ~60× — a modest 0.5px/ms flick projected ~14,900 world units, so EVERY flick
 * (small or large) landed thousands of units past the graph and got hard-clamped
 * to the exact same pan-bounds edge. That read as a snap, not a glide, and lost
 * all proportionality. Corrected to the standard iOS projection, where the
 * landing offset is the residual velocity integrated over the geometric decay:
 * ```
 * d       = decay                         // --topology-v2-camera-momentum-decay ≈ 0.998
 * worldV  = -v / cameraScale * 1000       // world units/sec, seeds the spring's velocity
 * offset  = -v / cameraScale * d/(1 − d)  // = worldV/1000 · d/(1−d), world units
 * landing = cameraPosition + offset
 * ```
 * Now a 0.5px/ms flick at scale 1 projects −249.5 world units (proportional),
 * a 0.25px/ms flick exactly half that. Landings within the pan bounds glide
 * freely; only a landing that would exceed the bounds is clamped by the caller
 * (`topology-pointer-handlers.ts`) so the graph's own edge rubber-bands
 * (`engine/camera.ts#clampAxisToPanBounds`) instead of stranding the camera.
 * Both x and y axes use the same formula independently.
 *
 * This module is pure — the caller is responsible for calling `stepSpring`
 * afterward with the returned `worldVelocity` seeded in and `landingTarget` as
 * the new spring target. Exact expected values are pinned in `momentum.test.ts`.
 *
 * R4 (Motion Charter — the motion charter): the `d/(1-d)` projection gain below is the SAME iOS
 * deceleration math the house vocabulary declares as
 * `model/motion-physics.ts#momentumDecayGain` / `projectMomentum`. It stays
 * inlined here (not imported) on purpose: `engine/` is the lower layer and must
 * not depend on `model/` (the established direction is `model → engine`, e.g.
 * `model/relayout-home.ts` importing `engine/spring`). motion-physics is the
 * canonical vocabulary for model-level and DOM/new motion; this engine spoke
 * mirrors it, and `motion-physics.test.ts` pins the shared closed form.
 */

/** One recorded pointer position while dragging (screen px + `performance.now()`). */
interface DragSample {
  x: number;
  y: number;
  t: number;
}

export interface ReleaseVelocityInput {
  /** Recent drag samples (`dragHistoryRef`), oldest → newest. */
  history: readonly DragSample[];
  /** `performance.now()` at pointerup. */
  releaseTime: number;
  /** Trailing window sampled for release velocity, ms — `--topology-v2-camera-release-velocity-window-ms`. */
  windowMs: number;
  /** |velocity| below this (px/ms) counts as stationary → hold, no glide — `--topology-v2-camera-flick-min-speed`. */
  minSpeedPxPerMs: number;
}

export interface ReleaseVelocity {
  /** Screen-space release velocity, px/ms. Zeroed when the release was stationary. */
  vx: number;
  vy: number;
  /** True only for a release WITH motion above the threshold — the sole momentum trigger. */
  isFlick: boolean;
}

/**
 * Stationary-release gate (owner spec: "If stopped after dragging, stop right there" — after
 * dragging, stopping stops it right there) — the iOS
 * scroll rule. Samples pointer velocity over the last `windowMs` before release
 * and returns `isFlick: false` (zero velocity) when the pointer was stationary
 * at release, so the caller holds the camera exactly where it is. Only a release
 * WITH motion (a genuine flick) returns `isFlick: true` to trigger the momentum
 * glide (`projectFlickLanding`).
 *
 * Why a trailing window and not first→last over the whole gesture: when the user
 * pans, stops, and holds before lifting, the recent samples cluster at the rest
 * position (or stop arriving entirely). Anchoring the measurement window at the
 * release time means a held release has no fast samples in-window — a flat
 * first→last over the entire history would keep reading the initial fling speed
 * and glide anyway (the QA/owner-reported bug).
 *
 * Pure — no DOM/token knowledge; the caller passes the resolved token values.
 */
export function sampleReleaseVelocity(input: ReleaseVelocityInput): ReleaseVelocity {
  const { history, releaseTime, windowMs, minSpeedPxPerMs } = input;
  const windowStart = releaseTime - windowMs;
  const inWindow = history.filter((sample) => sample.t >= windowStart);
  if (inWindow.length < 2) return { vx: 0, vy: 0, isFlick: false };

  const first = inWindow[0];
  const last = inWindow[inWindow.length - 1];
  const dtMs = Math.max(1, last.t - first.t);
  const vx = (last.x - first.x) / dtMs;
  const vy = (last.y - first.y) / dtMs;

  if (Math.hypot(vx, vy) < minSpeedPxPerMs) return { vx: 0, vy: 0, isFlick: false };
  return { vx, vy, isFlick: true };
}

export interface FlickReleaseInput {
  /** Screen-space release velocity, px/ms, one axis. */
  velocityPxPerMs: number;
  /** Camera's current world-space position on this axis at release time. */
  cameraPosition: number;
  /** Camera's current scale (shared across both axes). */
  cameraScale: number;
  /** Momentum decay per the geometric series, `--topology-v2-camera-momentum-decay` ≈ 0.998. */
  decay: number;
}

export interface FlickReleaseResult {
  /** World-space camera target to spring toward (`camera.tx`/`ty` in the prototype). */
  landingTarget: number;
  /** World-space velocity to seed the spring's velocity term with (`camera.vx`/`vy`). */
  worldVelocity: number;
}

/**
 * Projects where a released pan-flick should land, one axis at a time.
 * Call once per axis (x, y) with that axis's release velocity and current
 * position — `cameraScale` is shared.
 */
export function projectFlickLanding(input: FlickReleaseInput): FlickReleaseResult {
  const { velocityPxPerMs, cameraPosition, cameraScale, decay } = input;
  // World-space residual velocity (seeds the spring). Screen px/ms → world/sec.
  const worldVelocity = (-velocityPxPerMs / cameraScale) * 1000;
  // iOS projection: landing offset = residual velocity integrated over the
  // geometric decay = (worldVelocity/1000) · d/(1−d), proportional to velocity.
  // `decay / (1 - decay)` is the house `momentumDecayGain` (R4 Motion Charter — the
  // motion charter),
  // inlined here to keep engine/ independent of model/ (see module header).
  const landingOffset = (-velocityPxPerMs / cameraScale) * (decay / (1 - decay));
  const landingTarget = cameraPosition + landingOffset;
  // -0 normalization: a zero-velocity release must yield +0, not IEEE -0
  // (spring seeding and Object.is-based equality both treat them differently).
  return {
    landingTarget: landingTarget === 0 ? 0 : landingTarget,
    worldVelocity: worldVelocity === 0 ? 0 : worldVelocity,
  };
}
