/**
 * Altitude tier computation — the B2+ prototype's `farT`/`updateAltitude()`/
 * `renderAltitude()` (`docs/prototypes/topology-b2plus.html` §8b, §11).
 *
 * Contract (`docs/TOPOLOGY-V2-DESIGN.md` §3.1 — "hard invariant: NO discrete
 * branch"): a single continuous `farT ∈ [0,1]` drives every visual axis
 * (fill/stroke tier, corner-radius morph, label alpha, edge width). There is
 * no `if (mode === 'far') {...} else {...}` anywhere downstream — only this
 * one interpolation value. `altitude.test.ts` enforces that invariant
 * structurally: sampling `computeFarT` at closely-spaced scale values must
 * never show a jump larger than what continuity allows.
 *
 * - `FAR_HIGH = OVERVIEW_SCALE * 0.92` (`--topology-v2-altitude-far-high-ratio`)
 *   — at/above this camera scale: pure circuit (farT = 0).
 * - `FAR_LOW  = OVERVIEW_SCALE * 0.62` (`--topology-v2-altitude-far-low-ratio`)
 *   — at/below this: pure constellation (farT = 1).
 * - Tier labels (altitude chip text, §3.1 table): `circuit` when farT < 0.15,
 *   `constellation` when farT > 0.85, `transitioning` in between (prototype
 *   `renderAltitude()`).
 *
 * Pure math — no camera/DOM/token knowledge beyond the numbers passed in.
 *
 * STUB: the lead implements the bodies. See `altitude.test.ts`.
 */

export type AltitudeTier = "circuit" | "transitioning" | "constellation";

/**
 * Canonical smoothstep, `t*t*(3-2t)` after clamping `(v-edge0)/(edge1-edge0)`
 * to `[0,1]`. Ported from the prototype's `smoothstep()`.
 */
export function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** `FAR_HIGH = overviewScale * farHighRatio`, `FAR_LOW = overviewScale * farLowRatio`. */
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

/**
 * `farT = 1 - smoothstep(farLow, farHigh, cameraScale)`. This is the single
 * value every P3 draw function (`render/*.ts`) reads to interpolate its
 * visual expression — never a discrete mode flag.
 */
export function computeFarT(cameraScale: number, farLow: number, farHigh: number): number {
  return 1 - smoothstep(farLow, farHigh, cameraScale);
}

/** Altitude chip label — `circuit` / `transitioning` / `constellation`. */
export function classifyAltitudeTier(farT: number): AltitudeTier {
  if (farT < 0.15) return "circuit";
  if (farT > 0.85) return "constellation";
  return "transitioning";
}
