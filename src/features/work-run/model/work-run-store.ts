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
  beginScheduledRun,
  closeScheduledCard,
  finishScheduledRun,
  hideScheduledCard,
  isScheduledActive,
  markScheduledSeen,
  observeScheduledDocument,
  observeScheduledStep,
  type ScheduledRun,
  type ScheduledRunLane,
  type ScheduledRunResult,
  type ScheduledRunStep,
} from './scheduled-run';
import {
  closeMeaningCard,
  hideMeaningCard,
  isMeaningActive,
  meaningProgressOf,
  observeMeaning,
  sameMeaningProgress,
  type MeaningProgress,
  type MeaningRun,
  type MeaningRunObservation,
} from './meaning-run';

/** A door the seat asks the owning screen to open once it is mounted for the run's folder. */
export type WorkRunDoor = 'results' | 'conversation';

/** The meaning card's doors: the Wiki desk with its question field, or the desk to fix a failure. */
export type MeaningDoor = 'ask' | 'library';

/** The meaning run's figures reach the card and the rail at most this often (four a second). */
export const MEANING_PROGRESS_INTERVAL_MS = 250;

/** One run the session holds: the person's wiki check, a scheduled check, or a folder's meaning preparation. */
export type SeatRun =
  | { kind: 'check'; key: string; run: WorkRun }
  | { kind: 'scheduled'; key: string; run: ScheduledRun }
  | { kind: 'meaning'; key: string; run: MeaningRun };

export interface WorkRunSnapshot {
  /** Every run the session holds, keyed by `check:<id>` or `scheduled:<ledger id>`, in start order. */
  runs: ReadonlyMap<string, SeatRun>;
  /** The wiki check, which the Library reads as its own; at most one exists. */
  run: WorkRun | null;
  /** The open folder; a scheduled run of another folder is never shown. */
  folder: string | null;
  /** The folder whose Check results stage is on screen; the check's card stands down for it. */
  stageFolder: string | null;
  /** Automations is on screen, the stage of every scheduled run. */
  automationsShown: boolean;
  /** The open folder's meaning stage (the Wiki desk's meaning line) is on screen. */
  meaningStage: boolean;
  door: { runId: number; kind: WorkRunDoor } | null;
}

const NO_RUNS: ReadonlyMap<string, SeatRun> = new Map();
const EMPTY: WorkRunSnapshot = {
  runs: NO_RUNS, run: null, folder: null, stageFolder: null, automationsShown: false, meaningStage: false, door: null,
};

let snapshot: WorkRunSnapshot = EMPTY;
let stopTurn: { runId: number; stop: () => void } | null = null;
const scheduledStops = new Map<string, () => void>();
let nextId = 0;
const listeners = new Set<() => void>();

/** The open folder's meaning Stop and the doors, registered by the app layer that knows the job and the screens. */
let meaningStop: (() => void) | null = null;
let meaningDoor: ((kind: MeaningDoor) => void) | null = null;
/** The meaning run's figures: apart from the snapshot, paced, and only the latest kept. */
let progress: MeaningProgress | null = null;
let pendingProgress: MeaningProgress | null = null;
let progressAt = Number.NEGATIVE_INFINITY;
let progressTimer: ReturnType<typeof setTimeout> | null = null;
const progressListeners = new Set<() => void>();

const checkKey = (id: number) => `check:${id}`;
const scheduledKey = (id: string) => `scheduled:${id}`;
/** One meaning run per folder: another folder's stays as it was left until that folder opens again. */
const meaningKey = (folder: string) => `meaning:${folder}`;

function checkOf(runs: ReadonlyMap<string, SeatRun>): WorkRun | null {
  for (const entry of runs.values()) if (entry.kind === 'check') return entry.run;
  return null;
}

function publish(next: Partial<WorkRunSnapshot>) {
  const merged = { ...snapshot, ...next };
  if (next.runs) merged.run = checkOf(next.runs);
  const same = merged.runs === snapshot.runs && merged.folder === snapshot.folder && merged.stageFolder === snapshot.stageFolder
    && merged.automationsShown === snapshot.automationsShown && merged.meaningStage === snapshot.meaningStage
    && merged.door === snapshot.door;
  if (same) return;
  snapshot = merged;
  listeners.forEach((listener) => listener());
}

function withEntry(entry: SeatRun): ReadonlyMap<string, SeatRun> {
  const runs = new Map(snapshot.runs);
  runs.set(entry.key, entry);
  return runs;
}

function changeCheck(id: number | null, update: (run: WorkRun) => WorkRun) {
  const run = snapshot.run;
  if (!run || (id !== null && run.id !== id)) return;
  const next = update(run);
  if (next !== run) publish({ runs: withEntry({ kind: 'check', key: checkKey(run.id), run: next }) });
}

function changeScheduled(key: string, update: (run: ScheduledRun) => ScheduledRun) {
  const entry = snapshot.runs.get(key);
  if (entry?.kind !== 'scheduled') return;
  const next = update(entry.run);
  if (next !== entry.run) publish({ runs: withEntry({ kind: 'scheduled', key, run: next }) });
}

/** Every scheduled run, through one update; a single new map however many changed. */
function changeEveryScheduled(update: (run: ScheduledRun) => ScheduledRun) {
  let runs: Map<string, SeatRun> | null = null;
  for (const entry of snapshot.runs.values()) {
    if (entry.kind !== 'scheduled') continue;
    const next = update(entry.run);
    if (next === entry.run) continue;
    runs ??= new Map(snapshot.runs);
    runs.set(entry.key, { ...entry, run: next });
  }
  if (runs) publish({ runs });
}

function changeMeaning(key: string, update: (run: MeaningRun) => MeaningRun) {
  const entry = snapshot.runs.get(key);
  if (entry?.kind !== 'meaning') return;
  const next = update(entry.run);
  if (next !== entry.run) publish({ runs: withEntry({ kind: 'meaning', key, run: next }) });
}

function setProgress(next: MeaningProgress | null, at: number) {
  if (progressTimer !== null) clearTimeout(progressTimer);
  progressTimer = null;
  pendingProgress = null;
  progressAt = at;
  if (sameMeaningProgress(progress, next)) return;
  progress = next;
  progressListeners.forEach((listener) => listener());
}

/**
 * Publishes at once when the last publish is an interval old, else holds the figure for the end of
 * the interval; a figure held is replaced, never queued, so nothing is kept per event.
 */
function paceProgress(next: MeaningProgress, at: number) {
  const wait = progressAt + MEANING_PROGRESS_INTERVAL_MS - at;
  if (wait <= 0) {
    setProgress(next, at);
    return;
  }
  pendingProgress = next;
  progressTimer ??= setTimeout(() => {
    progressTimer = null;
    if (pendingProgress) setProgress(pendingProgress, progressAt + MEANING_PROGRESS_INTERVAL_MS);
  }, wait);
}

/** A scheduled run that ended and has nothing left to say leaves the session. */
function settledScheduled(entry: SeatRun): boolean {
  return entry.kind === 'scheduled' && !isScheduledActive(entry.run) && entry.run.card === 'closed' && !entry.run.unseen;
}

const stageShows = (run: WorkRun) => snapshot.stageFolder === run.folder;

/**
 * The app session's long runs, above every route: a screen that starts one may unmount while it
 * runs, and its result still lands here. Module state, so the turn's callbacks reach it from a
 * page that is gone. A call without a key addresses the wiki check, as the Library knows it.
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
    const previous = snapshot.run;
    const runs = new Map(snapshot.runs);
    if (previous) runs.delete(checkKey(previous.id));
    const run = beginRun({ id: nextId, ...input }, previous);
    runs.set(checkKey(run.id), { kind: 'check', key: checkKey(run.id), run });
    publish({ runs, door: null });
    return nextId;
  },
  /** The run this conversation is running, so its reports reach that run and no other. */
  runOwnedBy(owner: string): number | null {
    return snapshot.run?.owner === owner ? snapshot.run.id : null;
  },
  observeActivity(runId: number, activity: WorkRunActivity | null) {
    changeCheck(runId, (run) => observeActivity(run, activity));
  },
  observeRead(runId: number, page: string) {
    changeCheck(runId, (run) => observeRead(run, page));
  },
  markHandled(folder: string, key: string) {
    changeCheck(null, (run) => (run.folder === folder ? markHandled(run, key) : run));
  },
  finish(id: number, outcome: WorkRunOutcome, at: number) {
    changeCheck(id, (run) => finishRun(run, outcome, at, stageShows(run)));
  },
  /** The run's Stop, reported by its own conversation; a conversation clears only its own. */
  setStop(runId: number, stop: (() => void) | null) {
    if (stop) stopTurn = { runId, stop };
    else if (stopTurn?.runId === runId) stopTurn = null;
  },
  stop() {
    const run = snapshot.run;
    if (!run || !isRunActive(run)) return;
    changeCheck(run.id, closeCard);
    if (stopTurn?.runId === run.id) stopTurn.stop();
  },
  hide() {
    changeCheck(null, hideCard);
  },
  close() {
    changeCheck(null, closeCard);
  },
  markSeen(folder: string) {
    changeCheck(null, (run) => (run.folder === folder ? markSeen(run) : run));
  },
  /** A folder switch ends the check with the folder it was reading. */
  leaveFolder(folder: string, at: number) {
    publish({ folder });
    const run = snapshot.run;
    if (!run || run.folder === folder || !isRunActive(run)) return;
    publish({ runs: withEntry({ kind: 'check', key: checkKey(run.id), run: abandonRun(run, at) }), door: null });
    if (stopTurn?.runId === run.id) stopTurn.stop();
  },
  enterStage(folder: string) {
    publish({ stageFolder: folder });
    const run = snapshot.run;
    if (run && run.folder === folder && !isRunActive(run)) changeCheck(run.id, markSeen);
  },
  leaveStage(folder: string) {
    if (snapshot.stageFolder === folder) publish({ stageFolder: null });
  },
  openDoor(kind: WorkRunDoor) {
    const run = snapshot.run;
    if (!run) return;
    const next = kind === 'results' ? markSeen(run) : closeCard(run);
    publish({ door: { runId: run.id, kind }, runs: withEntry({ kind: 'check', key: checkKey(run.id), run: next }) });
  },
  takeDoor(runId: number) {
    if (snapshot.door?.runId === runId) publish({ door: null });
  },

  /** A scheduled pass the runner started, under the id its ledger entry will carry. */
  beginScheduled(input: { id: string; roundId: string; name: string; lane: ScheduledRunLane; folder: string | null; startedAt: number }): string {
    const key = scheduledKey(input.id);
    const runs = new Map([...snapshot.runs].filter(([, entry]) => !settledScheduled(entry)));
    runs.set(key, { kind: 'scheduled', key, run: beginScheduledRun(input) });
    publish({ runs });
    return key;
  },
  observeScheduledDocument(key: string, path: string, counts: boolean) {
    changeScheduled(key, (run) => observeScheduledDocument(run, path, counts));
  },
  observeScheduledStep(key: string, step: ScheduledRunStep) {
    changeScheduled(key, (run) => observeScheduledStep(run, step));
  },
  finishScheduled(key: string, end: { stopped: true } | { stopped: false; result: ScheduledRunResult }, at: number) {
    scheduledStops.delete(key);
    changeScheduled(key, (run) => finishScheduledRun(run, end, at, snapshot.automationsShown));
  },
  setScheduledStop(key: string, stop: (() => void) | null) {
    if (stop) scheduledStops.set(key, stop);
    else scheduledStops.delete(key);
  },

  /** Ends one run, whichever kind; a scheduled run's schedule is left exactly as it was. */
  stopRun(key: string) {
    const entry = snapshot.runs.get(key);
    if (entry?.kind === 'check') {
      if (entry.run.id === snapshot.run?.id) workRuns.stop();
      return;
    }
    if (entry?.kind === 'meaning') {
      if (!isMeaningActive(entry.run)) return;
      changeMeaning(key, closeMeaningCard);
      if (entry.run.folder === snapshot.folder) meaningStop?.();
      return;
    }
    if (!entry || !isScheduledActive(entry.run)) return;
    changeScheduled(key, closeScheduledCard);
    scheduledStops.get(key)?.();
  },
  /** The card's Hide: every run still working leaves the card and keeps its ring. */
  hideActive() {
    changeCheck(null, hideCard);
    changeEveryScheduled(hideScheduledCard);
    if (snapshot.folder !== null) changeMeaning(meaningKey(snapshot.folder), hideMeaningCard);
  },
  closeRun(key: string) {
    const entry = snapshot.runs.get(key);
    if (entry?.kind === 'check') changeCheck(entry.run.id, closeCard);
    else if (entry?.kind === 'meaning') changeMeaning(key, closeMeaningCard);
    else if (entry) changeScheduled(key, closeScheduledCard);
  },
  /** Opening Automations reads every finished scheduled run: its card closes and its badge goes. */
  enterAutomations() {
    publish({ automationsShown: true });
    changeEveryScheduled(markScheduledSeen);
  },
  leaveAutomations() {
    publish({ automationsShown: false });
  },

  /**
   * The open folder's meaning job as the app layer read it. The run changes only when its phase
   * or its card does; its figures go to `readMeaningProgress` at most once per interval.
   */
  observeMeaning(folder: string, observation: MeaningRunObservation | null, stageShown: boolean, at: number) {
    const key = meaningKey(folder);
    const entry = snapshot.runs.get(key);
    const previous = entry?.kind === 'meaning' ? entry.run : null;
    const next = observeMeaning(previous, observation, { folder, at, stageShown, nextId: () => (nextId += 1) });
    if (next !== previous) {
      const runs = new Map(snapshot.runs);
      if (next) runs.set(key, { kind: 'meaning', key, run: next });
      else runs.delete(key);
      publish({ runs, meaningStage: next !== null && stageShown });
    } else {
      publish({ meaningStage: next !== null && stageShown });
    }
    if (observation?.quiet && next !== null && next === previous && progress?.runId === next.id) return;
    const nextProgress = next && observation ? meaningProgressOf(next.id, observation) : null;
    const turned = next === null || next !== previous || progress?.runId !== next.id;
    if (turned || nextProgress === null) setProgress(nextProgress, at);
    else paceProgress(nextProgress, at);
  },
  readMeaningProgress: () => progress,
  subscribeMeaningProgress(listener: () => void) {
    progressListeners.add(listener);
    return () => {
      progressListeners.delete(listener);
    };
  },
  /** The open folder's meaning Stop, registered by the app layer. */
  setMeaningStop(stop: (() => void) | null) {
    meaningStop = stop;
  },
  /** Where the meaning card's doors lead, registered by the app layer that knows the screens. */
  setMeaningDoor(open: ((kind: MeaningDoor) => void) | null) {
    meaningDoor = open;
  },
  openMeaningDoor(key: string, kind: MeaningDoor) {
    changeMeaning(key, closeMeaningCard);
    meaningDoor?.(kind);
  },

  reset() {
    stopTurn = null;
    scheduledStops.clear();
    meaningStop = null;
    meaningDoor = null;
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
