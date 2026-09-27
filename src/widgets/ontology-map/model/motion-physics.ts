/**
 * The house spring family in Apple's two-parameter grammar (Designing Fluid Interfaces,
 * WWDC 2018): `damping` ζ (1.0 is critically damped, lower overshoots) and `response` in
 * seconds (ω = 1/response for `engine/spring.ts`). The spokes (camera spring, CSS
 * `--topology-motion-*` tokens, `engine/momentum.ts`) derive from here. The camera's
 * `--map-camera-spring-angfreq-*` tokens are tuned specialisations of the same grammar.
 */

/**
 * Bounds of the distance-proportional programmatic camera tween (`model/camera-easing.ts`).
 * The max matches `--topology-motion-camera-duration` (420 ms), so the canvas dive and chrome
 * riding the camera share one clock.
 */
export const CAMERA_TWEEN_MIN_MS = 200;
export const CAMERA_TWEEN_MAX_MS = 420;

export interface Spring {
  damping: number;
  response: number;
}

/** Every motion that is not the tail of a flick: panel enter/exit, chip appear, focus settle. */
export const UI_SPRING: Spring = { damping: 1.0, response: 0.35 };

/** Only for motion a gesture threw (pan-flick release); anywhere else the bounce is wrong. */
export const MOMENTUM_SPRING: Spring = { damping: 0.8, response: 0.35 };

/** The `angularFrequency` `engine/spring.ts` `stepSpring` takes. */
export function springAngularFrequency(spring: Spring): number {
  return 1 / spring.response;
}

/** Spread order ω then ζ, as `stepSpring` and `stepCamera` take them. */
export function toSpringConstants(spring: Spring): {
  angularFrequency: number;
  damping: number;
} {
  return { angularFrequency: springAngularFrequency(spring), damping: spring.damping };
}

/**
 * The geometric-series gain `d/(1-d)` of iOS scroll deceleration; `engine/momentum.ts`
 * `projectFlickLanding` projects through it so flick landing has one source.
 */
export function momentumDecayGain(decay: number): number {
  return decay / (1 - decay);
}

/**
 * `project(v) = (v/1000)·d/(1-d)` from release velocity in px/s, returning px.
 * `engine/momentum.ts` works in px/ms and calls `momentumDecayGain` directly.
 */
export function projectMomentum(velocityPxPerSec: number, decay = 0.998): number {
  return (velocityPxPerSec / 1000) * momentumDecayGain(decay);
}

/**
 * Apple's rubber band `(overshoot · dimension · c) / (dimension + c · |overshoot|)`: past a
 * bound the surface follows less the further it goes, so an edge reads as responsive rather
 * than a hard stop. Odd in `overshoot`, always smaller than it.
 */
export function rubberband(overshoot: number, dimension: number, constant = 0.55): number {
  if (overshoot === 0) return 0;
  return (overshoot * dimension * constant) / (dimension + constant * Math.abs(overshoot));
}
