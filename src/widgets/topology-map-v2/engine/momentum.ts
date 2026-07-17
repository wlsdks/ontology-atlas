/**
 * Flick-release momentum projection — ported 1:1 from the B2+ prototype's
 * `releaseDrag()` (`docs/prototypes/topology-b2plus.html` §9 "interaction state").
 *
 * Contract (`docs/TOPOLOGY-V2-DESIGN.md` §2.4, §4 P2 — "projection formula
 * (v/1000)·d/(1−d)"): when a pan drag is released with screen-space velocity
 * `v` (px/ms, sampled from the last ~6 pointermove history entries), the
 * camera does not stop instantly — it projects a landing target using a
 * geometric-decay series and hands that target + a residual world-space
 * velocity to the spring (`engine/spring.ts`, `damping = 0.82` — see
 * `--topology-v2-camera-damping-flick`).
 *
 * Exact prototype steps (preserved 1:1 — do not "simplify" the algebra, the
 * intermediate `*1000`/`/1000` round-trip is the prototype's literal
 * computation even though it cancels to `v·d/(1−d)`):
 * ```
 * d          = decay                         // --topology-v2-camera-momentum-decay ≈ 0.998
 * projMs     = (v * 1000) * d / (1 - d) / 1000
 * worldV     = -v / cameraScale * 1000
 * landing    = cameraPosition + (-projMs * 60) / cameraScale
 * ```
 * Both x and y axes use the same formula independently. The `* 60` factor is
 * a prototype constant with no assigned `--topology-v2-*` token in the
 * design doc's §2.4 table — flagged as an open question for the lead/design
 * doc author (see this scaffold's handoff notes).
 *
 * This module is pure — the caller (`engine/camera.ts`) is responsible for
 * calling `stepSpring` afterward with the returned `worldVelocity` seeded in
 * and `landingTarget` as the new spring target.
 *
 * STUB: the lead implements the body. Exact expected values are pinned in
 * `momentum.test.ts` (hand-derived from the formula above).
 */

/** One recorded pointer position while dragging (screen px + `performance.now()`). */
export interface DragSample {
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
 * 정지 릴리스 게이트 (owner spec: "드래그 후 멈추면 그 자리에 정지") — the iOS
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
  const projMs = ((velocityPxPerMs * 1000) * decay) / (1 - decay) / 1000;
  const worldVelocity = (-velocityPxPerMs / cameraScale) * 1000;
  const landingTarget = cameraPosition + (-projMs * 60) / cameraScale;
  // -0 normalization: a zero-velocity release must yield +0, not IEEE -0
  // (spring seeding and Object.is-based equality both treat them differently).
  return {
    landingTarget,
    worldVelocity: worldVelocity === 0 ? 0 : worldVelocity,
  };
}
