/**
 * Spotlight ring phase contract.
 *
 * The dimming ramp is the semantic transition. The dashed ring is only a
 * bounded attention cue while that transition settles; once the target alpha
 * is reached, its last phase is retained instead of continuing to rotate just
 * because another canvas activity keeps the frame loop awake.
 */

export const SPOTLIGHT_DASH_PERIOD = 9;

export interface SpotlightPhaseStepInput {
  dashOffset: number;
  settling: boolean;
  reducedMotion: boolean;
  dtSeconds: number;
  speedPxPerMs: number;
  period?: number;
}

export function stepSpotlightPhase({
  dashOffset,
  settling,
  reducedMotion,
  dtSeconds,
  speedPxPerMs,
  period = SPOTLIGHT_DASH_PERIOD,
}: SpotlightPhaseStepInput): number {
  if (reducedMotion) return 0;
  if (!settling || period <= 0) return dashOffset;

  const next = dashOffset + Math.max(0, dtSeconds) * 1000 * Math.max(0, speedPxPerMs);
  return next % period;
}
