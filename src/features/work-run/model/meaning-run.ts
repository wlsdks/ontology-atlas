/**
 * Preparing a folder for search by meaning: a long run counted against a known total, held by the
 * app session beside the wiki check and the scheduled checks. The app layer reports it from the
 * job's status events, which keep arriving for hours.
 */

import type { WorkRunCardState } from './work-run';

export type MeaningRunPhase =
  | 'modelDownloading'
  | 'modelConverting'
  | 'waitingTurn'
  | 'preparing'
  | 'ready'
  | 'failed'
  | 'stopped';

export interface MeaningRunObservation {
  phase: MeaningRunPhase;
  updating: boolean;
  quiet: boolean;
  filesDone: number;
  filesTotal: number;
  bytes: { done: number; total: number } | null;
  reading: string | null;
  minutesLeft: number | null;
  failure: string | null;
  /** The press that started or resumed the job in this launch; `null` when it continues by itself. */
  pressed: number | null;
}

export interface MeaningRun {
  id: number;
  folder: string;
  phase: MeaningRunPhase;
  updating: boolean;
  failure: string | null;
  pressed: number | null;
  startedAt: number;
  card: WorkRunCardState;
}

/** The figures that change while it runs, published apart so they never redraw the shell. */
export interface MeaningProgress {
  runId: number;
  filesDone: number;
  filesTotal: number;
  bytes: { done: number; total: number } | null;
  reading: string | null;
  minutesLeft: number | null;
  /** Bytes while downloading, files while preparing, full while converting; `null` without a total. */
  fraction: number | null;
}

const ACTIVE: ReadonlySet<MeaningRunPhase> = new Set(['modelDownloading', 'modelConverting', 'waitingTurn', 'preparing']);

export const isMeaningActive = (run: MeaningRun): boolean => ACTIVE.has(run.phase);

export interface MeaningRunContext {
  folder: string;
  at: number;
  stageShown: boolean;
  nextId: () => number;
}

function begin(observation: MeaningRunObservation, context: MeaningRunContext, card: WorkRunCardState): MeaningRun {
  return {
    id: context.nextId(),
    folder: context.folder,
    phase: observation.phase,
    updating: observation.updating,
    failure: observation.failure,
    pressed: observation.pressed,
    startedAt: context.at,
    card,
  };
}

/**
 * The card a status leaves standing. A press opens it; a job that continues by itself after a
 * restart draws only the ring; an update of changed files never raises it. A failure raises it
 * even when it was hidden, Stop closes it, and a finish shows its result only where the card was
 * open, and never over the folder's own stage, where the result is already drawn.
 */
export function observeMeaning(
  previous: MeaningRun | null,
  observation: MeaningRunObservation | null,
  context: MeaningRunContext,
): MeaningRun | null {
  if (observation === null) return null;
  const run = previous?.folder === context.folder ? previous : null;
  // A small update leaves whatever stands, a result the person has not closed included.
  if (observation.quiet) return run;
  const active = ACTIVE.has(observation.phase);
  const newPress = observation.pressed !== null && observation.pressed !== run?.pressed;
  if (newPress) {
    // A press may be answered with the held status before the job starts; the card waits open.
    const ended = observation.phase === 'ready' || observation.phase === 'failed';
    return begin(observation, context, ended && context.stageShown ? 'closed' : 'open');
  }
  const startingFromPress = run?.phase === 'stopped' && run.card === 'open';
  if (run === null || (!isMeaningActive(run) && active && !startingFromPress)) {
    if (!active) return run;
    return begin(observation, context, observation.updating ? 'closed' : 'hidden');
  }

  const ending = isMeaningActive(run) && !active;
  let card = run.card;
  if (ending) {
    if (observation.phase === 'failed') card = context.stageShown ? 'closed' : 'open';
    else if (observation.phase === 'ready') card = run.card === 'open' && !context.stageShown ? 'open' : 'closed';
    else card = 'closed';
  }
  if (
    run.phase === observation.phase
    && run.updating === observation.updating
    && run.card === card
    && run.failure === observation.failure
  ) {
    return run;
  }
  return { ...run, phase: observation.phase, updating: observation.updating, failure: observation.failure, card };
}

export function meaningProgressOf(runId: number, observation: MeaningRunObservation): MeaningProgress {
  const { phase, filesDone, filesTotal, bytes } = observation;
  const files = filesTotal > 0 ? Math.min(1, filesDone / filesTotal) : null;
  const fraction = phase === 'modelDownloading'
    ? bytes && bytes.total > 0 ? Math.min(1, bytes.done / bytes.total) : null
    : phase === 'modelConverting' || phase === 'ready'
      ? 1
      : phase === 'preparing' ? files : null;
  return {
    runId,
    filesDone,
    filesTotal,
    bytes,
    reading: observation.reading,
    minutesLeft: observation.minutesLeft,
    fraction,
  };
}

export function sameMeaningProgress(a: MeaningProgress | null, b: MeaningProgress | null): boolean {
  if (a === null || b === null) return a === b;
  return a.runId === b.runId
    && a.filesDone === b.filesDone
    && a.filesTotal === b.filesTotal
    && a.bytes?.done === b.bytes?.done
    && a.bytes?.total === b.bytes?.total
    && a.reading === b.reading
    && a.minutesLeft === b.minutesLeft
    && a.fraction === b.fraction;
}

export function hideMeaningCard(run: MeaningRun): MeaningRun {
  return run.card === 'open' && isMeaningActive(run) ? { ...run, card: 'hidden' } : run;
}

export function closeMeaningCard(run: MeaningRun): MeaningRun {
  return run.card === 'closed' ? run : { ...run, card: 'closed' };
}
