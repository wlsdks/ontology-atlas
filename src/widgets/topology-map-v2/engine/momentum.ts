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
export function projectFlickLanding(_input: FlickReleaseInput): FlickReleaseResult {
  throw new Error(
    "TODO(lead): implement projectFlickLanding per docs/TOPOLOGY-V2-DESIGN.md §2.4 " +
      "and the prototype's releaseDrag() — engine/momentum.test.ts pins the exact expected values.",
  );
}
