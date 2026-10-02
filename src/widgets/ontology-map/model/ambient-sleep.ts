/**
 * Ambient sleep: always-on motion runs while input is recent and ramps to a stop long after the
 * hand leaves, so `isCanvasActive` can close and the frame loop can stop. The motion sleeps rather
 * than switching off because the comet is the only channel carrying a `depends` edge's direction.
 * Any input wakes the loop and restores it. A ramp, not a step, because a comet frozen mid-orbit
 * reads as breakage.
 */

export const AMBIENT_SLEEP_DELAY_MS = 30_000;

export const AMBIENT_SLEEP_RAMP_MS = 2_000;

/**
 * Speed factor in [0,1]: 1 until `delayMs` after input (identical to never sleeping),
 * then linear to 0 across `rampMs`. Time is a parameter so tests need no timers.
 */
export function ambientSleepFactor(
  nowMs: number,
  lastInputMs: number,
  delayMs: number = AMBIENT_SLEEP_DELAY_MS,
  rampMs: number = AMBIENT_SLEEP_RAMP_MS,
): number {
  const since = nowMs - lastInputMs;
  if (!Number.isFinite(since) || since <= delayMs) return 1;
  if (rampMs <= 0) return 0;
  const t = (since - delayMs) / rampMs;
  if (t >= 1) return 0;
  return 1 - t;
}

/**
 * True only at exactly 0: closing the activity condition mid-ramp would freeze the
 * comets at partial speed, which reads as broken.
 */
export function isAmbientAsleep(factor: number): boolean {
  return factor <= 0;
}

export interface AmbientClock {
  entry: number;
  lostMs: number;
  lastNowMs: number;
  lastFactor: number;
}

export function createAmbientClock(): AmbientClock {
  return { entry: Number.NaN, lostMs: 0, lastNowMs: 0, lastFactor: 1 };
}

export function stepAmbientClock(clock: AmbientClock, entry: number, nowMs: number, dtMs: number, factor: number): number {
  if (entry !== clock.entry) {
    clock.entry = entry;
    clock.lostMs = 0;
  } else {
    const gap = Math.max(0, nowMs - clock.lastNowMs);
    clock.lostMs += clock.lastFactor > 0 ? gap * (1 - factor) : gap - Math.min(gap, dtMs) * factor;
  }
  clock.lastNowMs = nowMs;
  clock.lastFactor = factor;
  return clock.lostMs;
}
