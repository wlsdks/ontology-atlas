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
 * **A poll never takes more than this share of the wall clock.**
 *
 * A web poll walks the whole folder and calls `getFile()` on every entry, because the File
 * System Access API has no cheaper way to read a modification time. Measured on the
 * 12,025-file fixture (2026-09-19, dev server, 15 s CPU profile at rest): about 230 ms per
 * walk, every 5 s — the only work on an idle Library, and it grows with the folder. So the
 * delay after a poll is at least the poll's own duration times this factor: a 230 ms walk
 * still idles at 5 s, a 2 s walk on a far larger folder waits 40 s, and no folder can make
 * the poll take more than a twentieth of the time. `MAX_POLL_DELAY_MS` keeps the promise
 * in `.claude/rules/surfaces.md` that the web is *delayed, not unavailable*.
 */
const POLL_COST_SHARE = 20;
export const MAX_POLL_DELAY_MS = 60_000;

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
  let lastPollMs = 0;

  const schedule = (gen: number): void => {
    if (!active || gen !== generation) return;
    timer = setTimer(() => {
      if (gen !== generation) return; // stopped/restarted before this fired
      void (async () => {
        const startedAt = now();
        const changed = await opts.poll();
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
