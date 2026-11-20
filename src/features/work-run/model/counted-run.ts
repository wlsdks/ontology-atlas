/**
 * A long run whose work is counted against a known total: preparing a folder for search by
 * meaning. It lives beside the wiki check's run and shares none of its fields; the app layer
 * reports it from the job's status events, which keep arriving for hours.
 */

import type { WorkRunCardState } from './work-run';

export type CountedRunPhase =
  | 'modelDownloading'
  | 'modelConverting'
  | 'waitingTurn'
  | 'preparing'
  | 'ready'
  | 'failed'
  | 'stopped';

/** A sentence the owning screen already says, named by its message key and values. */
export interface CountedRunSentence {
  message: string;
  values: Readonly<Record<string, string | number | undefined>>;
}

/** One status of the job as the app layer read it; `null` when the folder has nothing to tell. */
export interface CountedRunObservation {
  /** A stop that followed a failure is reported `failed`. */
  phase: CountedRunPhase;
  /** Preparing only files that changed after the folder was ready once. */
  updating: boolean;
  /** An update too small to draw anywhere outside the folder's own stage. */
  quiet: boolean;
  filesDone: number;
  filesTotal: number;
  /** While the model downloads. */
  bytes: { done: number; total: number } | null;
  /** The file being read, vault-relative. */
  reading: string | null;
  minutesLeft: number | null;
  failure: CountedRunSentence | null;
  /** The press that started or resumed the job in this launch; `null` when it continues by itself. */
  pressed: number | null;
}

/** What the card and the ring choose and word by; it changes only when the job changes phase. */
export interface CountedRun {
  kind: 'meaning';
  id: number;
  folder: string;
  phase: CountedRunPhase;
  updating: boolean;
  failure: CountedRunSentence | null;
  pressed: number | null;
  /** When the person started it, or when it was first seen running by itself. */
  startedAt: number;
  card: WorkRunCardState;
}

/** The figures that change while it runs, published apart so they never redraw the shell. */
export interface CountedProgress {
  runId: number;
  filesDone: number;
  filesTotal: number;
  bytes: { done: number; total: number } | null;
  reading: string | null;
  minutesLeft: number | null;
  /** Bytes while downloading, files while preparing, full while converting; `null` without a total. */
  fraction: number | null;
}

const ACTIVE: ReadonlySet<CountedRunPhase> = new Set(['modelDownloading', 'modelConverting', 'waitingTurn', 'preparing']);

export function isCountedActive(run: CountedRun | null): boolean {
  return run !== null && ACTIVE.has(run.phase);
}

function sameSentence(a: CountedRunSentence | null, b: CountedRunSentence | null): boolean {
  if (a === null || b === null) return a === b;
  if (a.message !== b.message) return false;
  const keys = new Set([...Object.keys(a.values), ...Object.keys(b.values)]);
  return [...keys].every((key) => a.values[key] === b.values[key]);
}

export interface CountedRunContext {
  folder: string;
  at: number;
  /** The folder's own stage (the Wiki desk's meaning line) is on screen. */
  stageShown: boolean;
  nextId: () => number;
}

/** A run begun now: open when the person pressed for it, else the ring alone. */
function begin(observation: CountedRunObservation, context: CountedRunContext, card: WorkRunCardState): CountedRun {
  return {
    kind: 'meaning',
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
export function observeCounted(
  previous: CountedRun | null,
  observation: CountedRunObservation | null,
  context: CountedRunContext,
): CountedRun | null {
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
  if (run === null || (!isCountedActive(run) && active && !startingFromPress)) {
    if (!active) return run;
    return begin(observation, context, observation.updating ? 'closed' : 'hidden');
  }

  const ending = isCountedActive(run) && !active;
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
    && sameSentence(run.failure, observation.failure)
  ) {
    return run;
  }
  return { ...run, phase: observation.phase, updating: observation.updating, failure: observation.failure, card };
}

export function progressOf(runId: number, observation: CountedRunObservation): CountedProgress {
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

export function sameProgress(a: CountedProgress | null, b: CountedProgress | null): boolean {
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

export function hideCounted(run: CountedRun): CountedRun {
  return run.card === 'open' && isCountedActive(run) ? { ...run, card: 'hidden' } : run;
}

export function closeCounted(run: CountedRun): CountedRun {
  return run.card === 'closed' ? run : { ...run, card: 'closed' };
}
