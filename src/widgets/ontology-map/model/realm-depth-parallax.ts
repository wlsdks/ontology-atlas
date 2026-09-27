/**
 * While a realm is active, pan and zoom lag only the render coordinates of the deep rings
 * (depth 2+), in proportion to the camera delta; world coordinates never change, and draw
 * and hit test add the same offset. It charges only on frames the camera moved and decays
 * within the idle gate's 1200 ms grace (exp(-1.2/0.18) ≈ 0.001 at tau 0.18 s).
 */

export interface DepthParallaxOffset {
  x: number;
  y: number;
}

export const ZERO_PARALLAX: DepthParallaxOffset = { x: 0, y: 0 };

export const REALM_PARALLAX_TAU_S = 0.18;
export const REALM_PARALLAX_FACTOR_DEPTH2 = 0.03;
/** The deeper the ring, the further it lags. */
export const REALM_PARALLAX_FACTOR_DEPTH3 = 0.06;
const REALM_PARALLAX_EPSILON = 0.02;

export function depthParallaxFactorForDepth(depth: number): number {
  if (depth <= 1) return 0;
  if (depth === 2) return REALM_PARALLAX_FACTOR_DEPTH2;
  return REALM_PARALLAX_FACTOR_DEPTH3;
}

/**
 * Decays the previous offset by exp(-dt/tau), then adds camera delta × factor; a constant
 * pan settles near factor·v·tau. `tau≤0` decays at once, the reduced-motion path.
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

export function isDepthParallaxActive(
  offset: DepthParallaxOffset,
  epsilon: number = REALM_PARALLAX_EPSILON,
): boolean {
  return Math.abs(offset.x) > epsilon || Math.abs(offset.y) > epsilon;
}

/** Draw and hit test call this same function, which rules out click misalignment. */
export function depthParallaxOffsetFor(
  depth: number | undefined,
  depth2: DepthParallaxOffset,
  depth3: DepthParallaxOffset,
): DepthParallaxOffset {
  if (depth === undefined || depth <= 1) return ZERO_PARALLAX;
  return depth === 2 ? depth2 : depth3;
}
