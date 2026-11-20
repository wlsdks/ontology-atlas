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

/** A door the seat asks the owning screen to open once it is mounted for the run's folder. */
export type WorkRunDoor = 'results' | 'conversation';

/** One run the session holds: the person's wiki check, a scheduled check, or a Library turn that may write. */
export type SeatRun =
  | { kind: 'check'; key: string; run: WorkRun }
  | { kind: 'scheduled'; key: string; run: ScheduledRun }
  | { kind: 'turn'; key: string; run: TurnRun };

/** Where a turn's card door leads: its conversation, or the one page it wrote. */
export type TurnDoor = { turnId: number; kind: 'conversation' } | { turnId: number; kind: 'page'; page: string };

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
  /** The conversation on screen, the stage of the turn it runs. */
  turnStage: string | null;
  door: { runId: number; kind: WorkRunDoor } | null;
  turnDoor: TurnDoor | null;
}

const NO_RUNS: ReadonlyMap<string, SeatRun> = new Map();
const EMPTY: WorkRunSnapshot = {
  runs: NO_RUNS, run: null, folder: null, stageFolder: null, automationsShown: false, turnStage: null, door: null, turnDoor: null,
};

let snapshot: WorkRunSnapshot = EMPTY;
let stopTurn: { runId: number; stop: () => void } | null = null;
const scheduledStops = new Map<string, () => void>();
const turnStops = new Map<number, () => void>();
let nextId = 0;
const listeners = new Set<() => void>();

const checkKey = (id: number) => `check:${id}`;
const scheduledKey = (id: string) => `scheduled:${id}`;
const turnKey = (id: number) => `turn:${id}`;

function checkOf(runs: ReadonlyMap<string, SeatRun>): WorkRun | null {
  for (const entry of runs.values()) if (entry.kind === 'check') return entry.run;
  return null;
}

function publish(next: Partial<WorkRunSnapshot>) {
  const merged = { ...snapshot, ...next };
  if (next.runs) merged.run = checkOf(next.runs);
  const same = merged.runs === snapshot.runs && merged.folder === snapshot.folder && merged.stageFolder === snapshot.stageFolder
    && merged.automationsShown === snapshot.automationsShown && merged.door === snapshot.door
    && merged.turnStage === snapshot.turnStage && merged.turnDoor === snapshot.turnDoor;
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

function changeTurn(id: number, update: (run: TurnRun) => TurnRun) {
  const entry = snapshot.runs.get(turnKey(id));
  if (entry?.kind !== 'turn') return;
  const next = update(entry.run);
  if (next !== entry.run) publish({ runs: withEntry({ kind: 'turn', key: entry.key, run: next }) });
}

/** Every turn, through one update; a single new map however many changed. */
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

/** A scheduled run or a turn that ended and has nothing left to say leaves the session. */
function settledScheduled(entry: SeatRun): boolean {
  if (entry.kind === 'turn') return !isTurnActive(entry.run) && entry.run.card === 'closed' && !entry.run.unseen;
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
    for (const entry of [...snapshot.runs.values()]) {
      if (entry.kind !== 'turn' || entry.run.folder === folder || !isTurnActive(entry.run) || entry.run.switched) continue;
      changeTurn(entry.run.id, (turn) => stopTurnRun(turn, true));
      publish({ turnDoor: null });
      turnStops.get(entry.run.id)?.();
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
  /** The card's Hide: every run still working leaves the card and keeps its ring. */
  hideActive() {
    changeCheck(null, hideCard);
    changeEveryScheduled(hideScheduledCard);
    changeEveryTurn(hideTurnCard);
  },
  closeRun(key: string) {
    const entry = snapshot.runs.get(key);
    if (entry?.kind === 'check') changeCheck(entry.run.id, closeCard);
    else if (entry?.kind === 'turn') changeTurn(entry.run.id, closeTurnCard);
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

  /** A Library turn that may write, started from a door or a typed request. */
  beginTurn(input: { folder: string; folderName: string; owner: string; runtimeId: string; agent: string; door: TurnRunDoor; request: string; startedAt: number }): number {
    nextId += 1;
    const runs = new Map([...snapshot.runs].filter(([, entry]) => !settledScheduled(entry)));
    const run = beginTurnRun({ id: nextId, ...input });
    runs.set(turnKey(run.id), { kind: 'turn', key: turnKey(run.id), run });
    publish({ runs });
    return run.id;
  },
  /** The active turn this conversation runs, so its reports reach that turn and no other. */
  turnOwnedBy(owner: string): number | null {
    for (const entry of snapshot.runs.values()) {
      if (entry.kind === 'turn' && entry.run.owner === owner && isTurnActive(entry.run)) return entry.run.id;
    }
    return null;
  },
  /** This folder's turn still running, wherever its conversation is. */
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
  /** Opening the Library reads every finished turn of its folder: the badge goes. */
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

  reset() {
    stopTurn = null;
    scheduledStops.clear();
    turnStops.clear();
    snapshot = EMPTY;
    listeners.forEach((listener) => listener());
  },
};
