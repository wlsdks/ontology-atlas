/**
 * Eases the warding circle to a new radius when a realm's visible set changes, holding
 * while the target is unchanged, so there is one ease per change and no continuous motion.
 * The loop (`ui/use-topology-loop.ts`) keeps the state in a ref and steps it each frame.
 */

import { easeInOutCubic } from "./camera-easing";

/** The design charter's 240 ms ceiling. */
export const WARDING_REFIT_MS = 240;
/** World units, so micro-jitter cannot restart the tween. */
const REFIT_EPSILON = 0.5;

export interface WardingFitState {
  value: number;
  from: number;
  to: number;
  /** `performance.now`-compatible; negative means settled. */
  startMs: number;
}

export function initWardingFit(radius: number): WardingFitState {
  return { value: radius, from: radius, to: radius, startMs: -1 };
}

/**
 * A target change beyond the deadband starts a new tween from the rendered value (reduced
 * motion snaps); a settled unchanged target holds.
 */
export function stepWardingFit(
  state: WardingFitState,
  measuredTarget: number,
  now: number,
  reducedMotion: boolean,
): WardingFitState {
  if (Math.abs(measuredTarget - state.to) > REFIT_EPSILON) {
    if (reducedMotion) {
      return { value: measuredTarget, from: measuredTarget, to: measuredTarget, startMs: -1 };
    }
    return { value: state.value, from: state.value, to: measuredTarget, startMs: now };
  }
  if (state.startMs < 0) return state;
  const p = (now - state.startMs) / WARDING_REFIT_MS;
  if (p >= 1) return { value: state.to, from: state.to, to: state.to, startMs: -1 };
  return { ...state, value: state.from + (state.to - state.from) * easeInOutCubic(p) };
}
