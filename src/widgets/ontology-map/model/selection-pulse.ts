/**
 * A one-shot commit pulse (ring expansion and fade over `--map-select-pulse-duration-ms`) in
 * place of a glow, which `.claude/rules/design.md` forbids; the static double ring is the
 * permanent indicator. The caller passes elapsed time, so this stays deterministic.
 */
export interface SelectionPulseVisual {
  scaleFactor: number;
  alpha: number;
}

/** When the caller does not pass the token through. */
const DEFAULT_SCALE_DELTA = 0.28;

/**
 * `null` before commit and once played out; no modulo, so a stale ref stays expired. The
 * ring expands on easeOutCubic and alpha dies quadratically, both with zero end slope, so
 * the commit reads as received rather than cut off. `scaleDelta` is
 * `--map-select-pulse-scale-delta`.
 */
export function computeSelectionPulse(
  elapsedMs: number,
  durationMs: number,
  scaleDelta: number = DEFAULT_SCALE_DELTA,
): SelectionPulseVisual | null {
  if (elapsedMs < 0 || elapsedMs >= durationMs) return null;
  const t = elapsedMs / durationMs;
  const easeOut = 1 - Math.pow(1 - t, 3);
  return {
    scaleFactor: 1 + scaleDelta * easeOut,
    alpha: Math.pow(1 - t, 2),
  };
}
