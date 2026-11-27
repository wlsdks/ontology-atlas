// Adaptive poll cadence: after a detected change poll fast for a short window, then decay to the idle interval. Pure, so it is testable without the hook or timers.

export interface PollCadenceConfig {
  burstMs: number;
  idleMs: number;
  burstWindowMs: number;
}

export const DEFAULT_POLL_CADENCE: PollCadenceConfig = {
  burstMs: 1500,
  idleMs: 5000,
  burstWindowMs: 15000,
};

/**
 * A poll walks the whole folder, so the delay is at least poll time times this factor, capping
 * polling at a twentieth of wall time. `MAX_POLL_DELAY_MS` keeps a slow folder delayed, not stopped.
 */
const POLL_COST_SHARE = 20;
export const MAX_POLL_DELAY_MS = 60_000;

/** Bursts while within `burstWindowMs` of `lastChangeAt` (epoch ms, null if none yet); otherwise idles. */
export function nextPollDelay(
  lastChangeAt: number | null,
  now: number,
  config: PollCadenceConfig = DEFAULT_POLL_CADENCE,
  /** How long the last poll itself took, in ms; the delay is never less than `POLL_COST_SHARE` times it. */
  lastPollMs = 0,
): number {
  const floor = Math.min(MAX_POLL_DELAY_MS, Math.max(0, lastPollMs) * POLL_COST_SHARE);
  if (lastChangeAt == null) return Math.max(config.idleMs, floor);
  const sinceChange = now - lastChangeAt;
  if (sinceChange < 0) return Math.max(config.idleMs, floor); // clock skew guard
  return Math.max(sinceChange < config.burstWindowMs ? config.burstMs : config.idleMs, floor);
}

export interface AdaptivePoller {
  start(): void;
  stop(): void;
}

/**
 * Self-rescheduling poll loop with a generation token: an in-flight `poll()` that resolves after a stop/restart must not
 * re-arm an orphaned second loop, which a boolean flag leaks when hide→show brackets a poll. Timers and clock are injectable.
 */
export function createAdaptivePoller(options: {
  poll: () => Promise<boolean>;
  config?: PollCadenceConfig;
  now?: () => number;
  setTimer?: (callback: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
}): AdaptivePoller {
  const config = options.config ?? DEFAULT_POLL_CADENCE;
  const now = options.now ?? (() => Date.now());
  const setTimer = options.setTimer ?? ((callback, ms) => setTimeout(callback, ms));
  const clearTimer = options.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));

  let generation = 0; // bumped on every start AND stop; stale callbacks bail
  let active = false;
  let timer: unknown = null;
  let lastChangeAt: number | null = null;
  let lastPollMs = 0;

  const schedule = (gen: number): void => {
    if (!active || gen !== generation) return;
    timer = setTimer(() => {
      if (gen !== generation) return; // stopped/restarted before this fired
      void (async () => {
        const startedAt = now();
        const changed = await options.poll();
        lastPollMs = Math.max(0, now() - startedAt);
        if (gen !== generation) return; // stopped/restarted during the await — do NOT re-arm
        if (changed) lastChangeAt = now();
        schedule(gen);
      })();
    }, nextPollDelay(lastChangeAt, now(), config, lastPollMs));
  };

  return {
    start(): void {
      if (active) return; // idempotent — already running
      active = true;
      generation += 1;
      schedule(generation);
    },
    stop(): void {
      active = false;
      generation += 1; // invalidate any in-flight callback / pending timer
      if (timer != null) {
        clearTimer(timer);
        timer = null;
      }
    },
  };
}
