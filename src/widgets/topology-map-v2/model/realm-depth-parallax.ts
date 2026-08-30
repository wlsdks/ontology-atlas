/**
 * "Realm expansion" depth parallax (S5, designed by fable) — pure module, with no
 * knowledge of the DOM or the camera.
 *
 * While a realm is active and the user pans or zooms, only the **render
 * coordinates** of the deep rings (depth2+) lag, in proportion to the camera's
 * movement delta. World coordinates never change: the offset is added immediately
 * before drawing, and before hit-testing. Once the camera stops, the offset
 * spring-decays to 0 and the nodes converge back into place.
 *
 * Why a plain decay: this is an **input response**, not a continuous animation. The
 * offset only charges on frames where the camera moved, and vanishes within tau
 * once it stops. To keep the idle gate's runtime contract (stop redrawing after a
 * grace period with no movement), the decay must be effectively 0 inside the
 * 1200 ms grace — at tau 0.18 s that is exp(-1.2/0.18) ≈ 0.001, negligible (see the
 * caller's comment).
 *
 * Deterministic: the same (prev, cameraDelta, factor, dt, tau) always yields the
 * same offset. Contract: `realm-depth-parallax.test.ts`.
 */

export interface DepthParallaxOffset {
  x: number;
  y: number;
}

export const ZERO_PARALLAX: DepthParallaxOffset = { x: 0, y: 0 };

/** Decay time constant (seconds) — how fast the offset vanishes once the camera stops. */
export const REALM_PARALLAX_TAU_S = 0.18;
/** depth2 (capability ring) parallax factor — 3% of the camera delta. */
export const REALM_PARALLAX_FACTOR_DEPTH2 = 0.03;
/** depth3+ (element ring) parallax factor — 6%. The deeper the ring, the further it lags. */
export const REALM_PARALLAX_FACTOR_DEPTH3 = 0.06;
/** Below this absolute world-unit offset, treat it as converged and inactive. */
const REALM_PARALLAX_EPSILON = 0.02;

/**
 * Member depth → parallax factor. depth≤1 (root and domain rings) is 0, i.e. no
 * parallax; depth2 is 3%; depth3+ is 6%. Pure and deterministic.
 */
export function depthParallaxFactorForDepth(depth: number): number {
  if (depth <= 1) return 0;
  if (depth === 2) return REALM_PARALLAX_FACTOR_DEPTH2;
  return REALM_PARALLAX_FACTOR_DEPTH3;
}

/**
 * One parallax step for a single depth band (pure). Exponentially decays the
 * previous offset toward 0, then adds this frame's camera delta (world units)
 * × factor.
 *
 * - Camera at rest (cameraDelta 0): the offset converges to 0 as exp(-dt/tau).
 * - Constant pan: the offset settles into a small lag near factor·v·tau — the deep
 *   ring follows the camera at (1-factor) speed and so appears to trail.
 * - factor 0: always 0 (depth≤1).
 *
 * `tau≤0` decays instantly, leaving nothing — the reduced-motion safe path.
 */
export function stepDepthParallax(
  prev: DepthParallaxOffset,
  cameraDelta: DepthParallaxOffset,
  factor: number,
  dtSeconds: number,
  tauSeconds: number = REALM_PARALLAX_TAU_S,
): DepthParallaxOffset {
  const decay = tauSeconds > 0 ? Math.exp(-dtSeconds / tauSeconds) : 0;
  return {
    x: prev.x * decay + factor * cameraDelta.x,
    y: prev.y * decay + factor * cameraDelta.y,
  };
}

/** Is a meaningful offset still left? False once both axes are within epsilon. */
export function isDepthParallaxActive(
  offset: DepthParallaxOffset,
  epsilon: number = REALM_PARALLAX_EPSILON,
): boolean {
  return Math.abs(offset.x) > epsilon || Math.abs(offset.y) > epsilon;
}

/**
 * One node's render offset (world units) — the depth band picks one of the two
 * offsets, and unknown depth or depth≤1 gives 0. Draw and hit-test call the
 * **same** function, which is what rules out click misalignment.
 */
export function depthParallaxOffsetFor(
  depth: number | undefined,
  depth2: DepthParallaxOffset,
  depth3: DepthParallaxOffset,
): DepthParallaxOffset {
  if (depth === undefined || depth <= 1) return ZERO_PARALLAX;
  return depth === 2 ? depth2 : depth3;
}
