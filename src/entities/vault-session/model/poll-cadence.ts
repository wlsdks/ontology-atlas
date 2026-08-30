// poll-cadence — Atlas roadmap Track A #6.
//
// The local-vault auto-refresh polled at a fixed 5s. On the web/non-Tauri
// surface that is the only live signal (the Tauri shell gets instant OS
// file-watch), so an agent write took up to 5s to surface — coarse, not "live".
// Adaptive cadence: right after a change is detected (the agent is likely
// mid-session), poll fast for a short window; when quiet, decay back to the
// cheap 5s idle interval. Pure + deterministic so it is unit-testable without
// the hook/timers; the FS Access API has no native dir-change event, so
// adaptive polling is the ceiling here without a backend (local-first).

export interface PollCadenceConfig {
  /** fast interval (ms) used right after a change is detected */
  burstMs: number;
  /** slow interval (ms) used when quiet — the prior fixed cadence */
  idleMs: number;
  /** how long (ms) to keep bursting after the last detected change */
  burstWindowMs: number;
}

export const DEFAULT_POLL_CADENCE: PollCadenceConfig = {
  burstMs: 1500,
  idleMs: 5000,
  burstWindowMs: 15000,
};

/**
 * Delay (ms) before the next poll.
 * @param lastChangeAt epoch ms of the last detected change, or null if none yet
 * @param now epoch ms
 * Bursts while within `burstWindowMs` of the last change; otherwise idles.
 */
export function nextPollDelay(
  lastChangeAt: number | null,
  now: number,
  config: PollCadenceConfig = DEFAULT_POLL_CADENCE,
): number {
  if (lastChangeAt == null) return config.idleMs;
  const sinceChange = now - lastChangeAt;
  if (sinceChange < 0) return config.idleMs; // clock skew guard
  return sinceChange < config.burstWindowMs ? config.burstMs : config.idleMs;
}

export interface AdaptivePoller {
  start(): void;
  stop(): void;
}

/**
 * Self-rescheduling adaptive poll loop with a **generation token** so an
 * in-flight async `poll()` that resolves AFTER a stop/restart can never re-arm
 * a second (orphaned) loop. The naive "boolean active flag" version leaks a
 * concurrent loop when hide→show brackets an in-flight poll (the burst window
 * makes that the common case). Timers/clock are injectable so the lifecycle is
 * unit-testable without React or real timers.
 *
 * @param poll async tick; resolves true when a change was detected (→ burst)
 */
export function createAdaptivePoller(opts: {
  poll: () => Promise<boolean>;
  config?: PollCadenceConfig;
  now?: () => number;
  setTimer?: (cb: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
}): AdaptivePoller {
  const config = opts.config ?? DEFAULT_POLL_CADENCE;
  const now = opts.now ?? (() => Date.now());
  const setTimer = opts.setTimer ?? ((cb, ms) => setTimeout(cb, ms));
  const clearTimer = opts.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));

  let generation = 0; // bumped on every start AND stop; stale callbacks bail
  let active = false;
  let timer: unknown = null;
  let lastChangeAt: number | null = null;

  const schedule = (gen: number): void => {
    if (!active || gen !== generation) return;
    timer = setTimer(() => {
      if (gen !== generation) return; // stopped/restarted before this fired
      void (async () => {
        const changed = await opts.poll();
        if (gen !== generation) return; // stopped/restarted during the await — do NOT re-arm
        if (changed) lastChangeAt = now();
        schedule(gen);
      })();
    }, nextPollDelay(lastChangeAt, now(), config));
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
