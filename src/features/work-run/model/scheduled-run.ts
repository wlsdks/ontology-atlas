import type { RoundPassOutcome } from '@/entities/library-round';

import type { WorkRunCardState } from './work-run';

/**
 * One scheduled check in flight, held by the app session beside a person's own runs. Its count
 * is what the runner counted as it went: the ledger's own `checked` figure, never an estimate.
 */

export type ScheduledRunLane = 'ontology' | 'documents';

export type ScheduledRunStep = 'checking' | 'agent';

export type ScheduledRunPhase = 'running' | 'ended' | 'stopped';

export interface ScheduledRunResult {
  outcome: Exclude<RoundPassOutcome, 'asleep'>;
  checked: number;
  stale: number;
  written: number;
  summary: string;
}

export interface ScheduledRun {
  id: string;
  roundId: string;
  name: string;
  lane: ScheduledRunLane;
  folder: string | null;
  startedAt: number;
  endedAt: number | null;
  phase: ScheduledRunPhase;
  step: ScheduledRunStep;
  document: string | null;
  /** Append-only and shared by every snapshot of this run; `checkedCount` is what changes. */
  counted: ReadonlySet<string>;
  checkedCount: number;
  result: ScheduledRunResult | null;
  unseen: boolean;
  card: WorkRunCardState;
}

export function beginScheduledRun(input: {
  id: string;
  roundId: string;
  name: string;
  lane: ScheduledRunLane;
  folder: string | null;
  startedAt: number;
}): ScheduledRun {
  return {
    ...input,
    endedAt: null,
    phase: 'running',
    step: 'checking',
    document: null,
    counted: new Set(),
    checkedCount: 0,
    result: null,
    unseen: false,
    card: 'open',
  };
}

export const isScheduledActive = (run: ScheduledRun): boolean => run.phase === 'running';

/**
 * Names the document the run opened and, when it is one the run checks, counts it once however
 * often it is opened. O(1): the set grows in place, since copying it per document is quadratic.
 */
export function observeScheduledDocument(run: ScheduledRun, path: string, counts: boolean): ScheduledRun {
  if (!isScheduledActive(run)) return run;
  const counted = !counts || run.counted.has(path);
  if (counted && run.document === path) return run;
  if (!counted) (run.counted as Set<string>).add(path);
  return { ...run, document: path, checkedCount: run.counted.size };
}

/** A new step clears the document line, which named the previous step's last document. */
export function observeScheduledStep(run: ScheduledRun, step: ScheduledRunStep): ScheduledRun {
  return isScheduledActive(run) && run.step !== step ? { ...run, step, document: null } : run;
}

/**
 * Ends the run. Stopped runs leave no card: the person pressed Stop or changed the schedule on
 * its own stage. Where Automations stands the result draws there, so nothing waits unseen.
 */
export function finishScheduledRun(
  run: ScheduledRun,
  end: { stopped: true } | { stopped: false; result: ScheduledRunResult },
  at: number,
  stageVisible: boolean,
): ScheduledRun {
  if (!isScheduledActive(run)) return run;
  if (end.stopped) return { ...run, phase: 'stopped', endedAt: at, card: 'closed', unseen: false };
  return {
    ...run,
    phase: 'ended',
    endedAt: at,
    result: end.result,
    unseen: !stageVisible,
    card: stageVisible ? 'closed' : 'open',
  };
}

export function hideScheduledCard(run: ScheduledRun): ScheduledRun {
  return run.card === 'open' && isScheduledActive(run) ? { ...run, card: 'hidden' } : run;
}

export function closeScheduledCard(run: ScheduledRun): ScheduledRun {
  return run.card === 'closed' ? run : { ...run, card: 'closed' };
}

export function markScheduledSeen(run: ScheduledRun): ScheduledRun {
  if (isScheduledActive(run) || (!run.unseen && run.card === 'closed')) return run;
  return { ...run, unseen: false, card: 'closed' };
}

/** Held with nothing in scope: the run had no document to check, which is not "no changes". */
export function checkedNothing(result: ScheduledRunResult): boolean {
  return result.outcome === 'held' && result.checked === 0;
}
