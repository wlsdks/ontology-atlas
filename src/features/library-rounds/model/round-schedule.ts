import { type RoundRecord, isRoundDue, nextDueAt } from '@/entities/library-round';

/**
 * One clock tick as a pure decision: one pass at a time, local rounds first, a missed window
 * runs once (`nextDueAt` is strictly after now), and a long gap is recorded as asleep.
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
  /** `enabled` can arrive with a clone; a round this Mac never allowed is never due here. */
  allowedHere: (round: RoundRecord) => boolean;
  asleepAfterMs?: number;
}

export interface TickPlan {
  /** A gap to record before anything else, or null. */
  asleep: { from: Date; to: Date } | null;
  /** Rounds to run now, in order. Empty while a pass is running. */
  due: RoundRecord[];
}

export function planTick({ rounds, now, lastTickAt, running, allowedHere, asleepAfterMs = ASLEEP_AFTER_MS }: TickInput): TickPlan {
  const asleep =
    lastTickAt && now.getTime() - lastTickAt.getTime() > asleepAfterMs
      ? { from: lastTickAt, to: now }
      : null;
  if (running) return { asleep, due: [] };
  const due = rounds
    .filter((round) => isRoundDue(round, now) && allowedHere(round))
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
