export const TRAIL_GLINT_PERIOD_MS = 4000;
export const TRAIL_STAR_SWELL = 0.7;
export const TRAIL_IGNITE_MS = 360;
const TRAIL_IGNITE_SPAN_MS = 900;

export function trailIgniteStartMs(step: number, total: number): number {
  const stride = (TRAIL_IGNITE_SPAN_MS - TRAIL_IGNITE_MS) / Math.max(1, total - 1);
  return Math.max(0, step - 1) * stride;
}

export function igniteCurve(t: number): number {
  const u = t < 0 ? 0 : t > 1 ? 1 : t;
  return u * u * (3 - 2 * u);
}

export function starAttackCurve(t: number): number {
  const u = t < 0 ? 0 : t > 1 ? 1 : t;
  const inv = 1 - u;
  return 1 - inv * inv * inv;
}

export function starSwellCurve(t: number): number {
  const u = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.sin(Math.PI * Math.pow(u, TRAIL_SWELL_PHASE_EXP));
}

const TRAIL_SWELL_PHASE_EXP = 2.11;
export const TRAIL_STAR_TWINKLE = 0.14;
export const TRAIL_STAR_TWINKLE_MS = 3200;
export const TRAIL_STAR_TWINKLE_SPREAD_MS = 1400;
export const TRAIL_HALO_PX = 3.2;
export const TRAIL_HALO_ALPHA = 0.3;
