/**
 * Motion physics vocabulary — the single house spring family for topology-map-v2
 * (R4 "motion charter" — the motion charter; designed by fable, after Apple's
 * *Designing Fluid Interfaces*, WWDC 2018).
 *
 * WHY a vocabulary module: motion in this widget is expressed three different
 * ways — the camera rides `engine/spring.ts` (ω/ζ constants), the DOM chrome
 * rides CSS `--topology-motion-*` duration/easing tokens, and flick momentum
 * rides `engine/momentum.ts`'s decay projection. Before R4 each spoke declared
 * its own magic numbers with no shared grammar, so "make the whole thing feel
 * one way" meant hand-editing every spoke. This module declares the ONE grammar
 * Apple designers reason in — two parameters, `damping` (overshoot) and
 * `response` (settle time) — and the pure bridges from it to each spoke's own
 * constant system, so the family is the source and the spokes derive.
 *
 * The grammar (from the talk):
 * - **damping** (ζ) — overshoot. `1.0` = critically damped, no bounce; `< 1.0`
 *   overshoots. Lower is bouncier.
 * - **response** — how fast the value reaches the target, in seconds. NOT a
 *   fixed duration; a spring has no hard end. `ω = 1/response` rad/s bridges it
 *   to the semi-implicit integrator in `engine/spring.ts`.
 *
 * House springs (Apple's defaults, translated):
 * - `UI_SPRING` — critically damped default. Everything that just moves or
 *   settles. Overshoot on a menu that faded in feels wrong, so ζ = 1.0.
 * - `MOMENTUM_SPRING` — the ONLY under-damped spring, reserved for motion a
 *   flick/throw preceded (pan release). Overshoot on a card you flicked feels
 *   right, so ζ = 0.8.
 *
 * Relationship to the tuned camera tokens: the interactive/transition camera
 * springs (`--topology-v2-camera-spring-angfreq-*`) keep their own separately
 * tuned ω because a wheel-zoom and a cinematic dive genuinely want different
 * settle times than a chrome panel; they are camera SPECIALIZATIONS of the same
 * grammar, not overrides of it. `momentumDecayGain` here IS the single source
 * `engine/momentum.ts` now projects flicks through, so the momentum spoke
 * genuinely derives from this module.
 */

/**
 * Programmatic camera cubic-tween duration clamp (ms) — the feel bounds a
 * distance-proportional focus dive / fit-view is held between
 * (`model/camera-easing.ts` derives its `CAMERA_TRANSITION_MIN/MAX_MS` from
 * these). Co-located here so the widget has ONE home for its motion feel
 * constants: the max is deliberately the same 420ms the CSS
 * `--topology-motion-camera-duration` token carries, so the canvas dive and any
 * chrome that rides the camera stay on one clock. A small nudge earns the min;
 * a big cinematic leap earns the max. These are the ease-IN-OUT tween's bounds,
 * not a spring settle — the tween mirrors `UI_SPRING`'s critically-damped
 * (no-overshoot) character in a fixed-duration form for deliberate, legible
 * programmatic moves (van Wijk 2004 in spirit).
 */
export const CAMERA_TWEEN_MIN_MS = 200;
export const CAMERA_TWEEN_MAX_MS = 420;

/** A spring in Apple's 2-parameter grammar. */
export interface Spring {
  /** ζ — overshoot. 1.0 = critically damped (no bounce); < 1.0 overshoots. */
  damping: number;
  /** How fast the value reaches the target, in seconds. Bridges to ω = 1/response. */
  response: number;
}

/**
 * House default — critically damped, no overshoot. Use for any motion that
 * isn't the tail of a flick: panel enter/exit, chip appear, focus settle.
 */
export const UI_SPRING: Spring = { damping: 1.0, response: 0.35 };

/**
 * Momentum spring — slightly under-damped (ζ 0.8). Reserved for motion a
 * gesture threw: pan-flick release only. A little bounce reads as physical
 * follow-through; using it anywhere a gesture DIDN'T carry momentum is wrong.
 */
export const MOMENTUM_SPRING: Spring = { damping: 0.8, response: 0.35 };

/**
 * ω in rad/s for a spring — the reciprocal of `response`. This is the exact
 * value `engine/spring.ts#stepSpring` wants as its `angularFrequency` argument
 * (e.g. the `--topology-v2-camera-spring-angfreq` tokens are `1/response`).
 */
export function springAngularFrequency(spring: Spring): number {
  return 1 / spring.response;
}

/**
 * Bridges the 2-parameter grammar to the `(angularFrequency, damping)` pair
 * `engine/spring.ts#stepSpring` and `engine/camera.ts#stepCamera` consume, so a
 * caller can write `stepSpring(state, target, dt, ...toSpringConstants(UI_SPRING))`
 * (spread order: ω then ζ) and stay in the house vocabulary.
 */
export function toSpringConstants(spring: Spring): {
  angularFrequency: number;
  damping: number;
} {
  return { angularFrequency: springAngularFrequency(spring), damping: spring.damping };
}

/**
 * The geometric-series gain `d/(1-d)` behind iOS scroll-deceleration
 * projection. Pure and unit-agnostic — the caller supplies velocity already in
 * the unit it wants the offset in. `engine/momentum.ts#projectFlickLanding`
 * projects through THIS so the flick landing math has one source.
 */
export function momentumDecayGain(decay: number): number {
  return decay / (1 - decay);
}

/**
 * Apple's momentum projection `project(v) = (v/1000)·d/(1-d)` — where a flick's
 * resting offset from the current position is projected from its RELEASE
 * velocity (px/s), exactly like scroll deceleration. Returns the offset in px.
 * Sign-preserving and proportional to velocity. (`engine/momentum.ts` works in
 * px/ms and so calls `momentumDecayGain` directly rather than this px/s form.)
 */
export function projectMomentum(velocityPxPerSec: number, decay = 0.998): number {
  return (velocityPxPerSec / 1000) * momentumDecayGain(decay);
}

/**
 * Rubber-banding — soft boundary resistance. Past a boundary the surface should
 * follow the finger LESS the further out it's dragged, so an edge reads as
 * "responsive, but nothing more here" instead of a frozen hard stop. Apple's
 * closed form from the sample code:
 *
 *   `(overshoot · dimension · c) / (dimension + c · |overshoot|)`
 *
 * `overshoot` = distance dragged past the bound (signed), `dimension` = the
 * viewport/content extent, `c` ≈ 0.55. Odd in `overshoot` (symmetric past
 * either edge); |result| < |overshoot| always; grows monotonically but
 * sub-linearly. Returns the resisted offset to apply past the bound.
 */
export function rubberband(overshoot: number, dimension: number, constant = 0.55): number {
  if (overshoot === 0) return 0;
  return (overshoot * dimension * constant) / (dimension + constant * Math.abs(overshoot));
}
