/**
 * Altitude tier: one continuous `farT` in [0,1] drives every visual axis (fill and stroke
 * tier, corner morph, label alpha, edge width), never a discrete far/near branch
 * (`docs/design/ontology-map.md` §3.1; prototype `docs/prototypes/topology-b2plus.html` §8b).
 * `farT` is 0 at or above `FAR_HIGH` (`--map-altitude-far-high-ratio`) and 1 at or below
 * `FAR_LOW` (`--map-altitude-far-low-ratio`).
 */

export type AltitudeTier = "circuit" | "transitioning" | "constellation";

/** Canonical smoothstep `t*t*(3-2t)` of the clamped `(v-edge0)/(edge1-edge0)`. */
export function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

export function computeAltitudeBand(
  overviewScale: number,
  farHighRatio: number,
  farLowRatio: number,
): { farHigh: number; farLow: number } {
  return {
    farHigh: overviewScale * farHighRatio,
    farLow: overviewScale * farLowRatio,
  };
}

/** The single value every draw function interpolates from, never a mode flag. */
export function computeFarT(cameraScale: number, farLow: number, farHigh: number): number {
  return 1 - smoothstep(farLow, farHigh, cameraScale);
}

/** Chip label: `circuit` below 0.15, `constellation` above 0.85, `transitioning` between. */
export function classifyAltitudeTier(farT: number): AltitudeTier {
  if (farT < 0.15) return "circuit";
  if (farT > 0.85) return "constellation";
  return "transitioning";
}
