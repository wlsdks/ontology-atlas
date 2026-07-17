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
export function smoothstep(_edge0: number, _edge1: number, _value: number): number {
  throw new Error(
    "TODO(lead): implement smoothstep per the prototype's smoothstep() — altitude.test.ts pins exact values.",
  );
}

/** `FAR_HIGH = overviewScale * farHighRatio`, `FAR_LOW = overviewScale * farLowRatio`. */
export function computeAltitudeBand(
  _overviewScale: number,
  _farHighRatio: number,
  _farLowRatio: number,
): { farHigh: number; farLow: number } {
  throw new Error(
    "TODO(lead): implement computeAltitudeBand per docs/TOPOLOGY-V2-DESIGN.md §3.1 — altitude.test.ts pins exact values.",
  );
}

/**
 * `farT = 1 - smoothstep(farLow, farHigh, cameraScale)`. This is the single
 * value every P3 draw function (`render/*.ts`) reads to interpolate its
 * visual expression — never a discrete mode flag.
 */
export function computeFarT(_cameraScale: number, _farLow: number, _farHigh: number): number {
  throw new Error(
    "TODO(lead): implement computeFarT per docs/TOPOLOGY-V2-DESIGN.md §3.1 — altitude.test.ts pins exact values.",
  );
}

/** Altitude chip label — `circuit` / `transitioning` / `constellation`. */
export function classifyAltitudeTier(_farT: number): AltitudeTier {
  throw new Error(
    "TODO(lead): implement classifyAltitudeTier per the prototype's renderAltitude() — altitude.test.ts pins exact boundaries.",
  );
}
