/**
 * Semi-implicit Euler spring step: velocity updates before position, both with the same `dt`
 * (the explicit form goes unstable at large `dt`). Pure; the camera runs one per axis.
 */

/**
 * Frame delta cap (seconds) against a tab returning from the background. Semi-implicit Euler
 * diverges at `ω·dt` ≥ 1.0 (0.75 converges) and a NaN camera kills the canvas, so a contract
 * test bounds the tokens' largest ω times this value.
 */
export const MAX_FRAME_DELTA_SECONDS = 0.05;

/** `ω·dt` at or above this diverges (measured); the contract test measures headroom against it. */
export const SPRING_STABILITY_LIMIT = 1.0;

export interface SpringAxisState {
  value: number;
  /** Current velocity, in value-units per second. */
  velocity: number;
}

export type SpringStepResult = SpringAxisState;

/** One step toward `target`. Pure; the caller clamps `dt`. */
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
