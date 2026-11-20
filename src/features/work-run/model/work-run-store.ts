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

/** A door the seat asks the owning screen to open once it is mounted for the run's folder. */
export type WorkRunDoor = 'results' | 'conversation';

export interface WorkRunSnapshot {
  run: WorkRun | null;
  /** The folder whose Check results stage is on screen; the card stands down for it. */
  stageFolder: string | null;
  door: { runId: number; kind: WorkRunDoor } | null;
}

const EMPTY: WorkRunSnapshot = { run: null, stageFolder: null, door: null };

let snapshot: WorkRunSnapshot = EMPTY;
let stopTurn: { runId: number; stop: () => void } | null = null;
let nextId = 0;
const listeners = new Set<() => void>();

function publish(next: Partial<WorkRunSnapshot>) {
  const merged = { ...snapshot, ...next };
  if (merged.run === snapshot.run && merged.stageFolder === snapshot.stageFolder && merged.door === snapshot.door) return;
  snapshot = merged;
  listeners.forEach((listener) => listener());
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
  reset() {
    stopTurn = null;
    snapshot = EMPTY;
    listeners.forEach((listener) => listener());
  },
};
