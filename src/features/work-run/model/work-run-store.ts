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
import {
  beginTurnRun,
  closeTurnCard,
  finishTurnRun,
  hideTurnCard,
  isTurnActive,
  observeTurnTool,
  observeTurnWork,
  seeTurn,
  stopTurnRun,
  turnToolFact,
  type TurnEndOutcome,
  type TurnRun,
  type TurnRunDoor,
  type TurnToolEvent,
  type TurnWorkReport,
} from './turn-run';
import {
  afterRequest,
  beginMappingRun,
  closeMappingCard,
  hideMappingCard,
  isMappingActive,
  observeMappingWork,
  stopMappingRun,
  type MappingFigures,
  type MappingRequestEnd,
  type MappingRun,
  type MappingStopCause,
} from './mapping-run';

export type WorkRunDoor = 'results' | 'conversation';

export type MeaningDoor = 'ask' | 'library';

/** The meaning run's figures reach the card and the rail at most this often (four a second). */
export const MEANING_PROGRESS_INTERVAL_MS = 250;

export type SeatRun =
  | { kind: 'check'; key: string; run: WorkRun }
  | { kind: 'scheduled'; key: string; run: ScheduledRun }
  | { kind: 'turn'; key: string; run: TurnRun }
  | { kind: 'meaning'; key: string; run: MeaningRun }
  | { kind: 'mapping'; key: string; run: MappingRun };

export type TurnDoor = { turnId: number; kind: 'conversation' } | { turnId: number; kind: 'page'; page: string };

export interface WorkRunSnapshot {
  /** Every run the session holds, keyed by `check:<id>` or `scheduled:<ledger id>`, in start order. */
  runs: ReadonlyMap<string, SeatRun>;
  run: WorkRun | null;
  /** The open folder; a scheduled run of another folder is never shown. */
  folder: string | null;
  /** The folder whose Check results stage is on screen; the check's card stands down for it. */
  stageFolder: string | null;
  /** Automations is on screen, the stage of every scheduled run. */
  automationsShown: boolean;
  /** The open folder's meaning stage (the Wiki desk's meaning line) is on screen. */
  meaningStage: boolean;
  turnStage: string | null;
  /** The folder whose map conversation shows the mapping row; that folder's mapping card stands down. */
  mappingStage: string | null;
  door: { runId: number; kind: WorkRunDoor } | null;
  turnDoor: TurnDoor | null;
}

const NO_RUNS: ReadonlyMap<string, SeatRun> = new Map();
const EMPTY: WorkRunSnapshot = {
  runs: NO_RUNS, run: null, folder: null, stageFolder: null, automationsShown: false, meaningStage: false,
  turnStage: null, mappingStage: null, door: null, turnDoor: null,
};

let snapshot: WorkRunSnapshot = EMPTY;
let stopTurn: { runId: number; stop: () => void } | null = null;
const scheduledStops = new Map<string, () => void>();
const turnStops = new Map<number, () => void>();
const mappingStops = new Map<string, () => void>();
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
const turnKey = (id: number) => `turn:${id}`;
/** One mapping run per folder; nothing of it is persisted. */
const mappingKey = (folder: string) => `mapping:${folder}`;

function checkOf(runs: ReadonlyMap<string, SeatRun>): WorkRun | null {
  for (const entry of runs.values()) if (entry.kind === 'check') return entry.run;
  return null;
}

function publish(next: Partial<WorkRunSnapshot>) {
  const merged = { ...snapshot, ...next };
  if (next.runs) merged.run = checkOf(next.runs);
  const same = merged.runs === snapshot.runs && merged.folder === snapshot.folder && merged.stageFolder === snapshot.stageFolder
    && merged.automationsShown === snapshot.automationsShown && merged.meaningStage === snapshot.meaningStage
    && merged.door === snapshot.door && merged.turnStage === snapshot.turnStage && merged.turnDoor === snapshot.turnDoor
    && merged.mappingStage === snapshot.mappingStage;
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

function changeTurn(id: number, update: (run: TurnRun) => TurnRun) {
  const entry = snapshot.runs.get(turnKey(id));
  if (entry?.kind !== 'turn') return;
  const next = update(entry.run);
  if (next !== entry.run) publish({ runs: withEntry({ kind: 'turn', key: entry.key, run: next }) });
}

function changeEveryTurn(update: (run: TurnRun) => TurnRun) {
  let runs: Map<string, SeatRun> | null = null;
  for (const entry of snapshot.runs.values()) {
    if (entry.kind !== 'turn') continue;
    const next = update(entry.run);
    if (next === entry.run) continue;
    runs ??= new Map(snapshot.runs);
    runs.set(entry.key, { ...entry, run: next });
  }
  if (runs) publish({ runs });
}

function mappingOf(folder: string): MappingRun | null {
  const entry = snapshot.runs.get(mappingKey(folder));
  return entry?.kind === 'mapping' ? entry.run : null;
}

function changeMapping(folder: string, update: (run: MappingRun) => MappingRun): MappingRun | null {
  const run = mappingOf(folder);
  if (!run) return null;
  const next = update(run);
  if (next !== run) publish({ runs: withEntry({ kind: 'mapping', key: mappingKey(folder), run: next }) });
  return next;
}

function changeEveryMapping(update: (run: MappingRun) => MappingRun) {
  let runs: Map<string, SeatRun> | null = null;
  for (const entry of snapshot.runs.values()) {
    if (entry.kind !== 'mapping') continue;
    const next = update(entry.run);
    if (next === entry.run) continue;
    runs ??= new Map(snapshot.runs);
    runs.set(entry.key, { ...entry, run: next });
  }
  if (runs) publish({ runs });
}

function stopMapping(folder: string, reason: MappingStopCause) {
  const run = mappingOf(folder);
  if (!run || changeMapping(folder, (current) => stopMappingRun(current, reason)) === run) return;
  mappingStops.get(folder)?.();
}

function settledScheduled(entry: SeatRun): boolean {
  if (entry.kind === 'turn') return !isTurnActive(entry.run) && entry.run.card === 'closed' && !entry.run.unseen;
  return entry.kind === 'scheduled' && !isScheduledActive(entry.run) && entry.run.card === 'closed' && !entry.run.unseen;
}

const stageShows = (run: WorkRun) => snapshot.stageFolder === run.folder;

/** Closing an active run only lowers its card; closing an ended one removes it, so the row reads the disk again. */
function closeMapping(run: MappingRun) {
  if (isMappingActive(run)) {
    changeMapping(run.folder, closeMappingCard);
    return;
  }
  const runs = new Map(snapshot.runs);
  runs.delete(mappingKey(run.folder));
  publish({ runs });
}

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
  leaveFolder(folder: string, at: number) {
    publish({ folder });
    for (const entry of [...snapshot.runs.values()]) {
      if (entry.kind !== 'turn' || entry.run.folder === folder || !isTurnActive(entry.run) || entry.run.switched) continue;
      changeTurn(entry.run.id, (turn) => stopTurnRun(turn, true));
      publish({ turnDoor: null });
      turnStops.get(entry.run.id)?.();
    }
    for (const entry of [...snapshot.runs.values()]) {
      if (entry.kind === 'mapping' && entry.run.folder !== folder) stopMapping(entry.run.folder, 'switched');
    }
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
    if (entry?.kind === 'mapping') {
      stopMapping(entry.run.folder, 'press');
      return;
    }
    if (entry?.kind === 'turn') {
      if (!isTurnActive(entry.run) || entry.run.phase === 'stopping') return;
      changeTurn(entry.run.id, (run) => stopTurnRun(run, false));
      turnStops.get(entry.run.id)?.();
      return;
    }
    if (!entry || !isScheduledActive(entry.run)) return;
    changeScheduled(key, closeScheduledCard);
    scheduledStops.get(key)?.();
  },
  hideActive() {
    changeCheck(null, hideCard);
    changeEveryScheduled(hideScheduledCard);
    if (snapshot.folder !== null) changeMeaning(meaningKey(snapshot.folder), hideMeaningCard);
    changeEveryTurn(hideTurnCard);
    changeEveryMapping(hideMappingCard);
  },
  closeRun(key: string) {
    const entry = snapshot.runs.get(key);
    if (entry?.kind === 'check') changeCheck(entry.run.id, closeCard);
    else if (entry?.kind === 'meaning') changeMeaning(key, closeMeaningCard);
    else if (entry?.kind === 'turn') changeTurn(entry.run.id, closeTurnCard);
    else if (entry?.kind === 'mapping') closeMapping(entry.run);
    else if (entry) changeScheduled(key, closeScheduledCard);
  },
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
  setMeaningStop(stop: (() => void) | null) {
    meaningStop = stop;
  },
  setMeaningDoor(open: ((kind: MeaningDoor) => void) | null) {
    meaningDoor = open;
  },
  openMeaningDoor(key: string, kind: MeaningDoor) {
    changeMeaning(key, closeMeaningCard);
    meaningDoor?.(kind);
  },
  beginTurn(input: { folder: string; folderName: string; owner: string; runtimeId: string; agent: string; door: TurnRunDoor; request: string; startedAt: number }): number {
    nextId += 1;
    const runs = new Map([...snapshot.runs].filter(([, entry]) => !settledScheduled(entry)));
    const run = beginTurnRun({ id: nextId, ...input });
    runs.set(turnKey(run.id), { kind: 'turn', key: turnKey(run.id), run });
    publish({ runs });
    return run.id;
  },
  turnOwnedBy(owner: string): number | null {
    for (const entry of snapshot.runs.values()) {
      if (entry.kind === 'turn' && entry.run.owner === owner && isTurnActive(entry.run)) return entry.run.id;
    }
    return null;
  },
  activeTurn(folder: string): TurnRun | null {
    for (const entry of snapshot.runs.values()) {
      if (entry.kind === 'turn' && entry.run.folder === folder && isTurnActive(entry.run)) return entry.run;
    }
    return null;
  },
  observeTurnWork(id: number, work: TurnWorkReport | null, at: number) {
    changeTurn(id, (run) => observeTurnWork(run, work, at));
  },
  observeTurnTool(id: number, event: TurnToolEvent, vaultRoot: string) {
    changeTurn(id, (run) => observeTurnTool(run, turnToolFact(event, vaultRoot)));
  },
  setTurnStop(id: number, stop: (() => void) | null) {
    if (stop) turnStops.set(id, stop);
    else turnStops.delete(id);
  },
  finishTurn(id: number, end: { outcome: TurnEndOutcome; events: readonly TurnToolEvent[]; vaultRoot: string }, at: number) {
    turnStops.delete(id);
    changeTurn(id, (run) => finishTurnRun(run, end, at, snapshot.turnStage === run.owner));
  },
  enterTurnStage(owner: string) {
    publish({ turnStage: owner });
    changeEveryTurn((run) => (run.owner === owner ? seeTurn(run) : run));
  },
  leaveTurnStage(owner: string) {
    if (snapshot.turnStage === owner) publish({ turnStage: null });
  },
  seeTurns(folder: string) {
    changeEveryTurn((run) => (run.folder === folder && !isTurnActive(run) && run.unseen ? { ...run, unseen: false } : run));
  },
  openTurnDoor(door: TurnDoor) {
    changeTurn(door.turnId, (run) => (isTurnActive(run) ? run : closeTurnCard(run)));
    publish({ turnDoor: door });
  },
  takeTurnDoor(turnId: number) {
    if (snapshot.turnDoor?.turnId === turnId) publish({ turnDoor: null });
  },

  /** Starts the folder's mapping run at a press; null while one is already active there. */
  beginMapping(input: { folder: string; folderName: string; agent: string; figures: MappingFigures | null; startedAt: number }): MappingRun | null {
    const previous = mappingOf(input.folder);
    if (previous && isMappingActive(previous)) return null;
    nextId += 1;
    const run = beginMappingRun({ id: nextId, ...input });
    publish({ runs: withEntry({ kind: 'mapping', key: mappingKey(input.folder), run }) });
    return run;
  },
  /** The agent's latest report, paced by the caller; an unchanged line publishes at most once a minute. */
  observeMappingWork(folder: string, work: TurnWorkReport | null, at: number) {
    changeMapping(folder, (run) => observeMappingWork(run, work, at));
  },
  /** Ends the running request; the run returned is `running` when the next request should be sent. */
  endMappingBatch(folder: string, end: MappingRequestEnd): MappingRun | null {
    const next = changeMapping(folder, (run) => afterRequest(run, end));
    if (next && !isMappingActive(next)) mappingStops.delete(folder);
    return next;
  },
  /** The person's own message while no request runs: the run ends at once, so they can ask. */
  stopMappingForMessage(folder: string) {
    stopMapping(folder, 'message');
  },
  /** The driver's Stop: it must end the running request, which then reaches `endMappingBatch`. */
  setMappingStop(folder: string, stop: (() => void) | null) {
    if (stop) mappingStops.set(folder, stop);
    else mappingStops.delete(folder);
  },
  enterMappingStage(folder: string) {
    publish({ mappingStage: folder });
  },
  leaveMappingStage(folder: string) {
    if (snapshot.mappingStage === folder) publish({ mappingStage: null });
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
    turnStops.clear();
    mappingStops.clear();
    snapshot = EMPTY;
    listeners.forEach((listener) => listener());
    progressListeners.forEach((listener) => listener());
  },
};
