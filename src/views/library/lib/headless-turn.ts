import type { AcpTurnCompletion } from "@/features/acp-session";

/**
 * **One headless agent turn for a round's pass** — open the session, send one brief, wait for
 * the turn, close.
 *
 * ## Nothing here may outlive a stop, or the ceiling
 *
 * The runner runs one pass at a time, so a turn that never returns holds the lock for every
 * other round. Measured through the desktop bridge on 2026-09-25 with the handshake held open
 * (`acp_start` never answering): only the `send` step raced the person's stop, so a pass still
 * inside `start()` ignored Pause and Remove. The header kept naming a round that was paused or
 * already gone, no `stopped` line reached the ledger, and every other round's "Run now" stayed
 * disabled until the window was reloaded. The ceiling had the same hole: it was armed only
 * around `send`, so a handshake that never answered was never timed out at all.
 *
 * Every step now races one `over` promise — the person's stop or the pass ceiling, whichever
 * comes first — and the session is told to stop on the way out, with a bounded wait, so the
 * lock never depends on a native call answering.
 */

/** The four calls a pass makes on the agent session. `useAcpSession`'s value satisfies it. */
export interface HeadlessSession {
  start(): Promise<void>;
  send(text: string): Promise<void>;
  cancel(): void;
  stop(): Promise<void>;
}

/** The longest a pass may hold the one-pass lock, from the first step to the last. */
export const PASS_TIMEOUT_MS = 20 * 60_000;
const READY_WAIT_MS = 90_000;
const READY_POLL_MS = 250;
/** A finished turn's completion report may land a moment after `send` resolves. */
const COMPLETION_GRACE_MS = 5_000;
/** How long the pass waits for the session to close before giving the lock back anyway. */
const STOP_GRACE_MS = 5_000;

export interface HeadlessTurnInput {
  /** The session as it is now: the hook re-renders it, so it is read at every step. */
  session: () => HeadlessSession;
  /** The session's status as it is now. */
  status: () => string;
  brief: string;
  /** Resolves when the person pauses or removes the round whose pass this is. */
  aborted: Promise<void>;
  /** Resolves with the turn's completion once the session reports one. */
  completion: Promise<AcpTurnCompletion | null>;
  passTimeoutMs?: number;
  readyWaitMs?: number;
  readyPollMs?: number;
  completionGraceMs?: number;
  stopGraceMs?: number;
}

export interface HeadlessTurnResult {
  /** The turn did not complete: stopped, timed out, refused to start, or ended any other way. */
  failed: boolean;
  /** The person paused or removed the round while its turn was in flight. */
  stopped: boolean;
  /** What the session reported for a turn that ran; `null` when it never got that far. */
  completion: AcpTurnCompletion | null;
}

export async function runHeadlessTurn(input: HeadlessTurnInput): Promise<HeadlessTurnResult> {
  const { session, status, brief, aborted, completion } = input;
  const passTimeoutMs = input.passTimeoutMs ?? PASS_TIMEOUT_MS;
  const readyWaitMs = input.readyWaitMs ?? READY_WAIT_MS;
  const readyPollMs = input.readyPollMs ?? READY_POLL_MS;
  const completionGraceMs = input.completionGraceMs ?? COMPLETION_GRACE_MS;
  const stopGraceMs = input.stopGraceMs ?? STOP_GRACE_MS;

  const timers = new Set<ReturnType<typeof setTimeout>>();
  const after = (ms: number) =>
    new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        timers.delete(timer);
        resolve();
      }, ms);
      timers.add(timer);
    });

  let stopped = false;
  let timedOut = false;
  let finished = false;
  const over = Promise.race([
    aborted.then(() => {
      stopped = true;
    }),
    after(passTimeoutMs).then(() => {
      timedOut = true;
    }),
  ]);
  void over.then(() => {
    // A turn already on the wire is cancelled; one still starting is dropped by `stop()` below.
    if (finished) return;
    try {
      session().cancel();
    } catch {
      /* A session already gone cannot be cancelled; the stop below still runs. */
    }
  });

  let failed = false;
  try {
    const started = await Promise.race([session().start().then(() => true), over.then(() => false)]);
    if (!started) {
      failed = true;
    } else {
      const readyBy = Date.now() + readyWaitMs;
      while (status() !== "ready") {
        const now = status();
        if (stopped || timedOut || now === "error" || now === "exited" || Date.now() > readyBy) {
          failed = true;
          break;
        }
        await Promise.race([after(readyPollMs), over]);
      }
      if (!failed) {
        // The race returns the moment the person stops the pass or the ceiling passes; the
        // cancelled turn's own late answer or rejection is absorbed by the race.
        await Promise.race([session().send(brief), over]);
        if (stopped || timedOut) failed = true;
      }
    }
  } catch {
    failed = true;
  }

  const report = failed ? null : await Promise.race([completion, after(completionGraceMs).then(() => null)]);
  finished = true;
  await Promise.race([
    session()
      .stop()
      .catch(() => {
        /* A session that would not stop is reported by the next start; nothing to do here. */
      }),
    after(stopGraceMs),
  ]);
  for (const timer of timers) clearTimeout(timer);
  timers.clear();

  return {
    failed: failed || stopped || timedOut || !report || report.outcome !== "completed",
    stopped,
    completion: report,
  };
}
