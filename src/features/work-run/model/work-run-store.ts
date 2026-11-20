import {
  abandonRun,
  beginRun,
  closeCard,
  finishRun,
  hideCard,
  isRunActive,
  markHandled,
  markSeen,
  observeActivity,
  observeRead,
  type WorkRun,
  type WorkRunActivity,
  type WorkRunOutcome,
} from './work-run';
import {
  closeCounted,
  hideCounted,
  isCountedActive,
  observeCounted,
  progressOf,
  sameProgress,
  type CountedProgress,
  type CountedRun,
  type CountedRunObservation,
} from './counted-run';

/** A door the seat asks the owning screen to open once it is mounted for the run's folder. */
export type WorkRunDoor = 'results' | 'conversation';

export interface WorkRunSnapshot {
  run: WorkRun | null;
  /** The folder whose Check results stage is on screen; the card stands down for it. */
  stageFolder: string | null;
  door: { runId: number; kind: WorkRunDoor } | null;
  /** The open folder's counted run; a new value only when its phase or its card changes. */
  counted: CountedRun | null;
  /** The counted run's own stage (the Wiki desk's meaning line) is on screen. */
  countedStage: boolean;
}

const EMPTY: WorkRunSnapshot = { run: null, stageFolder: null, door: null, counted: null, countedStage: false };

/** Status events arrive many times a second for hours; the figures redraw at most this often. */
export const COUNTED_PROGRESS_INTERVAL_MS = 250;

let snapshot: WorkRunSnapshot = EMPTY;
let stopTurn: { runId: number; stop: () => void } | null = null;
let nextId = 0;
const listeners = new Set<() => void>();

/** Another folder's counted run, kept as it was so reopening that folder shows it as left. */
const parkedCounted = new Map<string, CountedRun>();
let countedStop: (() => void) | null = null;
let progress: CountedProgress | null = null;
let pendingProgress: CountedProgress | null = null;
let progressAt = Number.NEGATIVE_INFINITY;
let progressTimer: ReturnType<typeof setTimeout> | null = null;
const progressListeners = new Set<() => void>();

function publish(next: Partial<WorkRunSnapshot>) {
  const merged = { ...snapshot, ...next };
  if (
    merged.run === snapshot.run
    && merged.stageFolder === snapshot.stageFolder
    && merged.door === snapshot.door
    && merged.counted === snapshot.counted
    && merged.countedStage === snapshot.countedStage
  ) return;
  snapshot = merged;
  listeners.forEach((listener) => listener());
}

function setProgress(next: CountedProgress | null, at: number) {
  if (progressTimer !== null) clearTimeout(progressTimer);
  progressTimer = null;
  pendingProgress = null;
  progressAt = at;
  if (sameProgress(progress, next)) return;
  progress = next;
  progressListeners.forEach((listener) => listener());
}

/**
 * At most one redraw per interval: a figure that arrives sooner waits for the interval's end,
 * replacing any figure already waiting, so the last one always lands and none is kept.
 */
function paceProgress(next: CountedProgress, at: number) {
  const wait = progressAt + COUNTED_PROGRESS_INTERVAL_MS - at;
  if (wait <= 0) {
    setProgress(next, at);
    return;
  }
  pendingProgress = next;
  progressTimer ??= setTimeout(() => {
    progressTimer = null;
    if (pendingProgress) setProgress(pendingProgress, progressAt + COUNTED_PROGRESS_INTERVAL_MS);
  }, wait);
}

function changeCounted(update: (run: CountedRun) => CountedRun) {
  const run = snapshot.counted;
  if (run) publish({ counted: update(run) });
}

function change(id: number | null, update: (run: WorkRun) => WorkRun) {
  const run = snapshot.run;
  if (!run || (id !== null && run.id !== id)) return;
  publish({ run: update(run) });
}

const stageShows = (run: WorkRun) => snapshot.stageFolder === run.folder;

/**
 * The app session's long runs, above every route: a screen that starts one may unmount while it
 * runs, and its result still lands here. Module state, so the turn's callbacks reach it from a
 * page that is gone.
 */
export const workRuns = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  read: () => snapshot,
  readServer: () => EMPTY,
  begin(input: { folder: string; owner: string; agent: string; startedAt: number }): number {
    nextId += 1;
    stopTurn = null;
    publish({ run: beginRun({ id: nextId, ...input }, snapshot.run), door: null });
    return nextId;
  },
  /** The run this conversation is running, so its reports reach that run and no other. */
  runOwnedBy(owner: string): number | null {
    return snapshot.run?.owner === owner ? snapshot.run.id : null;
  },
  observeActivity(runId: number, activity: WorkRunActivity | null) {
    change(runId, (run) => observeActivity(run, activity));
  },
  observeRead(runId: number, page: string) {
    change(runId, (run) => observeRead(run, page));
  },
  markHandled(folder: string, key: string) {
    change(null, (run) => (run.folder === folder ? markHandled(run, key) : run));
  },
  finish(id: number, outcome: WorkRunOutcome, at: number) {
    change(id, (run) => finishRun(run, outcome, at, stageShows(run)));
  },
  /** The run's Stop, reported by its own conversation; a conversation clears only its own. */
  setStop(runId: number, stop: (() => void) | null) {
    if (stop) stopTurn = { runId, stop };
    else if (stopTurn?.runId === runId) stopTurn = null;
  },
  stop() {
    const run = snapshot.run;
    if (!run || !isRunActive(run)) return;
    change(run.id, closeCard);
    if (stopTurn?.runId === run.id) stopTurn.stop();
  },
  hide() {
    change(null, hideCard);
  },
  close() {
    change(null, closeCard);
  },
  markSeen(folder: string) {
    change(null, (run) => (run.folder === folder ? markSeen(run) : run));
  },
  /** A folder switch ends the check with the folder it was reading. */
  leaveFolder(folder: string, at: number) {
    const run = snapshot.run;
    if (!run || run.folder === folder || !isRunActive(run)) return;
    publish({ run: abandonRun(run, at), door: null });
    if (stopTurn?.runId === run.id) stopTurn.stop();
  },
  enterStage(folder: string) {
    publish({ stageFolder: folder });
    const run = snapshot.run;
    if (run && run.folder === folder && !isRunActive(run)) change(run.id, markSeen);
  },
  leaveStage(folder: string) {
    if (snapshot.stageFolder === folder) publish({ stageFolder: null });
  },
  openDoor(kind: WorkRunDoor) {
    const run = snapshot.run;
    if (!run) return;
    publish({ door: { runId: run.id, kind }, run: kind === 'results' ? markSeen(run) : closeCard(run) });
  },
  takeDoor(runId: number) {
    if (snapshot.door?.runId === runId) publish({ door: null });
  },
  /**
   * The open folder's counted job as the app layer read it. The run itself changes only when
   * its phase or card does; its figures go to `readProgress` at most once per interval.
   */
  observeCounted(folder: string, observation: CountedRunObservation | null, stageShown: boolean, at: number) {
    const current = snapshot.counted;
    if (current && current.folder !== folder) parkedCounted.set(current.folder, current);
    const previous = current?.folder === folder ? current : parkedCounted.get(folder) ?? null;
    parkedCounted.delete(folder);
    const next = observeCounted(previous, observation, {
      folder, at, stageShown, nextId: () => (nextId += 1),
    });
    publish({ counted: next, countedStage: next !== null && stageShown });
    const nextProgress = next && observation ? progressOf(next.id, observation) : null;
    const turned = next === null || next !== previous || progress?.runId !== next.id;
    if (turned || nextProgress === null) setProgress(nextProgress, at);
    else paceProgress(nextProgress, at);
  },
  readProgress: () => progress,
  subscribeProgress(listener: () => void) {
    progressListeners.add(listener);
    return () => {
      progressListeners.delete(listener);
    };
  },
  /** The counted job's Stop, registered by the app layer for the open folder. */
  setCountedStop(stop: (() => void) | null) {
    countedStop = stop;
  },
  stopCounted() {
    const run = snapshot.counted;
    if (!run || !isCountedActive(run)) return;
    changeCounted(closeCounted);
    countedStop?.();
  },
  hideCounted() {
    changeCounted(hideCounted);
  },
  closeCounted() {
    changeCounted(closeCounted);
  },
  reset() {
    stopTurn = null;
    countedStop = null;
    parkedCounted.clear();
    if (progressTimer !== null) clearTimeout(progressTimer);
    progressTimer = null;
    pendingProgress = null;
    progress = null;
    progressAt = Number.NEGATIVE_INFINITY;
    snapshot = EMPTY;
    listeners.forEach((listener) => listener());
    progressListeners.forEach((listener) => listener());
  },
};
