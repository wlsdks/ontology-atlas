import { type RoundRecord, isRoundDue, nextDueAt } from '@/entities/library-round';

/**
 * **One tick of the clock**, as a pure decision.
 *
 * The runner calls this every minute with what it knows and does what it is told: record a gap,
 * run the rounds that are due, in order. Keeping the decision out of the hook is what lets the
 * scheduling rules be tested with a fake clock in milliseconds rather than by waiting.
 *
 * ## The rules the spec fixes (§5)
 *
 * - **One at a time.** A tick with a pass already running does nothing.
 * - **Local first.** When several rounds are due, consistency rounds go before service rounds:
 *   they are free, and a stale page they find may be the very thing the service round would
 *   otherwise redraft twice.
 * - **Catch up once.** A round whose window passed while the Mac slept is due, runs once, and its
 *   next due time is the first boundary after *now* — `nextDueAt` is strictly-after, so the
 *   missed hours are not replayed.
 * - **Asleep is recorded.** A gap between ticks longer than `asleepAfterMs` means the machine or
 *   the app was not running; the ledger gets one gap entry so the axis can draw it honestly.
 */

export const TICK_MS = 60_000;
const ASLEEP_AFTER_MS = 3 * TICK_MS;

export interface TickInput {
  rounds: readonly RoundRecord[];
  now: Date;
  /** When the runner last ticked, or null on the first tick of this app run. */
  lastTickAt: Date | null;
  /** True while a pass is in progress. */
  running: boolean;
  asleepAfterMs?: number;
}

export interface TickPlan {
  /** A gap to record before anything else, or null. */
  asleep: { from: Date; to: Date } | null;
  /** Rounds to run now, in order. Empty while a pass is running. */
  due: RoundRecord[];
}

export function planTick({ rounds, now, lastTickAt, running, asleepAfterMs = ASLEEP_AFTER_MS }: TickInput): TickPlan {
  const asleep =
    lastTickAt && now.getTime() - lastTickAt.getTime() > asleepAfterMs
      ? { from: lastTickAt, to: now }
      : null;
  if (running) return { asleep, due: [] };
  const due = rounds
    .filter((round) => isRoundDue(round, now))
    .sort((a, b) => rank(a) - rank(b) || Date.parse(a.nextDueAt) - Date.parse(b.nextDueAt));
  return { asleep, due };
}

function rank(round: RoundRecord): number {
  if (round.kind === 'consistency') return 0;
  if (round.kind === 'ontology') return 1;
  return 2;
}

/** Whether a due run is on time or a catch-up: more than one tick late is a catch-up. */
export function triggerFor(round: RoundRecord, now: Date, tickMs = TICK_MS): 'clock' | 'catch-up' {
  const due = Date.parse(round.nextDueAt);
  return Number.isFinite(due) && now.getTime() - due > tickMs ? 'catch-up' : 'clock';
}

/** The record after a pass: last run stamped, next boundary strictly after now. */
export function afterPass(round: RoundRecord, now: Date): RoundRecord {
  return {
    ...round,
    lastPassAt: now.toISOString(),
    nextDueAt: nextDueAt(round.cadence, now).toISOString(),
  };
}
