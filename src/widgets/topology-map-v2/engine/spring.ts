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
 * 프레임 델타의 상한(초) — 탭을 백그라운드에 두다 돌아왔을 때의 dt 폭증을
 * 막는다. rAF 루프(`ui/use-topology-loop.ts`)가 이 값으로 자른다.
 *
 * **이 값은 스프링의 안정 조건과 한 쌍이다.** semi-implicit Euler 는
 * `ω·dt` 가 커지면 발산하고, 실측 경계는 **1.0** 이다(ω·dt=0.75 수렴,
 * 1.00 발산 — `spring.test.ts` 가 이 경계를 케이스로 들고 있다). 발산은
 * 곧 NaN 이고, NaN 카메라는 모든 투영으로 전파돼 캔버스 전체가 죽는다.
 *
 * 그래서 상수를 여기 두고 계약 테스트가 **토큰의 최대 ω × 이 값**을 잰다.
 * 둘이 다른 파일에 흩어져 있으면 한쪽만 올리는 순간 조용히 경계를 넘는다.
 */
export const MAX_FRAME_DELTA_SECONDS = 0.05;

/**
 * `ω·dt` 안정 경계 — 이 값 이상이면 발산한다(실측).
 *
 * 계약 테스트가 여유를 재는 기준이다. 숫자를 여기 한 번만 적어 두고
 * 테스트가 참조한다 — 두 곳에 적으면 갈라진다.
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
