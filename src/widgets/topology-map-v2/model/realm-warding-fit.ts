/**
 * S9 defect 2 — the easing state machine for warding-circle radius "refit".
 *
 * When expanding or collapsing a chip inside a realm changes the **visible member
 * set**, the warding circle must move to its new radius smoothly — breathing, never
 * a jump cut. This module is that transition's pure state: it takes a measured
 * target radius each frame, pushes the current value along a 240 ms ease, and
 * **holds** the value while the target is unchanged, so there is no continuous
 * animation — one ease per state change. reduced-motion snaps immediately.
 *
 * Why a pure module: the frame loop (`ui/use-topology-loop.ts`) owns the state in a
 * ref and steps `stepWardingFit` every frame, so the converge/snap/hold contract is
 * pinned by unit tests here instead.
 */

import { easeInOutCubic } from "./camera-easing";

/** Refit ease length (ms) — the design charter's "≤240ms" ceiling. */
export const WARDING_REFIT_MS = 240;
/** Deadband for detecting a target change (world units), so micro-jitter cannot restart the tween. */
const REFIT_EPSILON = 0.5;

export interface WardingFitState {
  /** Current radius to draw this frame. */
  value: number;
  /** Start radius of the in-flight tween. */
  from: number;
  /** Target radius of the in-flight tween. */
  to: number;
  /** Tween start time (`performance.now`-compatible). Negative = settled, i.e. holding. */
  startMs: number;
}

/** Initial state — settled at the given radius, no tween. */
export function initWardingFit(radius: number): WardingFitState {
  return { value: radius, from: radius, to: radius, startMs: -1 };
}

/**
 * Advance one frame:
 * - Measured target differs from the current tween target beyond the deadband →
 *   start a new 240 ms tween **from the currently rendered value**; under
 *   reduced-motion, snap.
 * - Mid-tween → advance along the ease, then snap to target and settle.
 * - Settled with an unchanged target → hold the value; never animate continuously.
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
  if (state.startMs < 0) return state; // settled — hold
  const p = (now - state.startMs) / WARDING_REFIT_MS;
  if (p >= 1) return { value: state.to, from: state.to, to: state.to, startMs: -1 };
  return { ...state, value: state.from + (state.to - state.from) * easeInOutCubic(p) };
}
