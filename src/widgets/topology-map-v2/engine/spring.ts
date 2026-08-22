/**
 * Semi-implicit (symplectic) Euler critically-damped spring integrator —
 * ported 1:1 from the B2+ prototype's `stepSpring()`
 * (`docs/prototypes/topology-b2plus.html` §8 "canvas + camera").
 *
 * Contract (`docs/TOPOLOGY-V2-DESIGN.md` §2.4, §4 P2):
 * ```
 *   f  = -ω² · (value - target) - 2 · ζ · ω · velocity
 *   v' = velocity + f · dt
 *   x' = value + v' · dt
 * ```
 * (velocity is updated BEFORE position, both using the same `dt` — semi-implicit
 * Euler, not the naive explicit form. Getting this order wrong is the most
 * common way to reintroduce numerical instability at large `dt`.)
 *
 * - `angularFrequency` (ω, rad/s) is `--topology-v2-camera-spring-angfreq`
 *   = 1/0.34 ≈ 2.941 rad/s (see `tokens/read-topology-v2-tokens.ts`).
 * - `damping` (ζ) = 1.0 is the critically-damped default (monotonic approach,
 *   no overshoot) — `--topology-v2-camera-damping-default`.
 * - `damping` = 0.82 is used only immediately after a thrown pan flick
 *   (`--topology-v2-camera-damping-flick`) — intentionally underdamped for a
 *   soft settle-bounce, per prototype `releaseDrag()`.
 *
 * This module is pure physics — no camera/DOM/token knowledge. `engine/camera.ts`
 * composes three independent instances of this (x, y, scale axes) per frame.
 *
 * STUB: the lead implements the body. Exact expected values are pinned in
 * `spring.test.ts` (hand-derived from the formula above, not from running
 * any implementation) so the test is the spec, not a regression snapshot.
 */

/**
 * The cap on a frame delta (seconds) — it stops the dt blowing up when a tab comes
 * back from the background. The rAF loop (`ui/use-topology-loop.ts`) clamps with
 * this value.
 *
 * **This value is paired with the spring's stability condition.** Semi-implicit
 * Euler diverges as `ω·dt` grows, and the measured boundary is **1.0**
 * (ω·dt = 0.75 converges, 1.00 diverges — `spring.test.ts` carries that boundary as
 * a case). Divergence means NaN, and a NaN camera propagates through every
 * projection and kills the whole canvas.
 *
 * So the constant lives here and a contract test measures **the tokens' maximum ω ×
 * this value**. Scattered across two files, raising only one of them would silently
 * cross the boundary.
 */
export const MAX_FRAME_DELTA_SECONDS = 0.05;

/**
 * The `ω·dt` stability boundary — at or above this it diverges (measured).
 *
 * The contract test measures headroom against it. The number is written here once
 * and the test references it — written in two places, they diverge.
 */
export const SPRING_STABILITY_LIMIT = 1.0;

export interface SpringAxisState {
  /** Current value — world x/y, or camera scale (unit-agnostic). */
  value: number;
  /** Current velocity, in value-units per second. */
  velocity: number;
}

export type SpringStepResult = SpringAxisState;

/**
 * Advances one axis of a critically-damped spring by `dt` seconds toward
 * `target`. Pure function — must not mutate `state`.
 *
 * @param state current `{value, velocity}`
 * @param target the spring's current target value (`camera.tx`/`ty`/`tscale`
 *   in the prototype — set by `setCameraTarget`/wheel/drag-release, never by
 *   this function)
 * @param dt elapsed seconds since the last step. Caller clamps this — the
 *   prototype uses `Math.min((now - lastT) / 1000, 0.05)` to guard against
 *   tab-backgrounding spikes; this function assumes the clamp already happened.
 * @param angularFrequency ω in rad/s — see `--topology-v2-camera-spring-angfreq`
 * @param damping ζ — 1.0 default (critically damped), 0.82 after a flick release
 */
export function stepSpring(
  state: SpringAxisState,
  target: number,
  dt: number,
  angularFrequency: number,
  damping: number,
): SpringStepResult {
  const force =
    -angularFrequency * angularFrequency * (state.value - target) -
    2 * damping * angularFrequency * state.velocity;
  const velocity = state.velocity + force * dt;
  const value = state.value + velocity * dt;
  return { value, velocity };
}
