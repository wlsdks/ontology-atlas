/**
 * One person-started long run, held by the app session rather than the screen that started it.
 * Every fact here was observed from the agent's turn: no total, percent or estimate exists.
 */

export interface WorkRunToolLabel {
  kind: 'known' | 'kind' | 'raw';
  text: string;
}

/** What the turn reported it is doing now, in the conversation's own words. */
export interface WorkRunActivity {
  kind: string;
  label: WorkRunToolLabel | null;
  target: string | null;
  asking: boolean;
}

export type WorkRunLine =
  | { kind: 'connecting' }
  | { kind: 'reading'; page: string }
  | { kind: 'tool'; label: WorkRunToolLabel }
  | { kind: 'writing' };

export type WorkRunPhase = 'running' | 'asking' | 'found' | 'clean' | 'unreadable' | 'failed' | 'stopped';

export type WorkRunCardState = 'open' | 'hidden' | 'closed';

export interface WorkRunReport {
  itemCount: number;
  pageCount: number;
  /** The parsed report, owned by the screen that reads it; the seat needs only the counts. */
  payload: unknown;
}

export interface WorkRun {
  id: number;
  /** The open folder's identity scope; a run never shows under another folder. */
  folder: string;
  agent: string;
  startedAt: number;
  endedAt: number | null;
  phase: WorkRunPhase;
  line: WorkRunLine;
  pagesRead: readonly string[];
  report: WorkRunReport | null;
  /** A finished report the person has not opened yet. */
  unseen: boolean;
  card: WorkRunCardState;
}

export type WorkRunOutcome =
  | { kind: 'stopped' }
  | { kind: 'failed' }
  | { kind: 'unreadable' }
  | { kind: 'report'; report: WorkRunReport };

export function isRunActive(run: WorkRun | null): boolean {
  return run !== null && (run.phase === 'running' || run.phase === 'asking');
}

export function beginRun(input: { id: number; folder: string; agent: string; startedAt: number }): WorkRun {
  return {
    ...input,
    endedAt: null,
    phase: 'running',
    line: { kind: 'connecting' },
    pagesRead: [],
    report: null,
    unseen: false,
    card: 'open',
  };
}

/** A line stays until a new fact replaces it, so thinking between calls never blanks it. */
function lineFor(current: WorkRunLine, activity: WorkRunActivity): WorkRunLine {
  if (activity.kind === 'answering') return { kind: 'writing' };
  if (activity.kind === 'reading' && activity.target) return { kind: 'reading', page: activity.target };
  if (activity.label && activity.label.text) return { kind: 'tool', label: activity.label };
  return current;
}

function sameLine(a: WorkRunLine, b: WorkRunLine): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'reading' && b.kind === 'reading') return a.page === b.page;
  if (a.kind === 'tool' && b.kind === 'tool') return a.label.kind === b.label.kind && a.label.text === b.label.text;
  return true;
}

export function observeActivity(run: WorkRun, activity: WorkRunActivity | null): WorkRun {
  if (!isRunActive(run) || activity === null) return run;
  const phase: WorkRunPhase = activity.asking ? 'asking' : 'running';
  const line = lineFor(run.line, activity);
  if (phase === run.phase && sameLine(line, run.line)) return run;
  return { ...run, phase, line: sameLine(line, run.line) ? run.line : line };
}

/** A completed read names its file and counts it once, however often the agent opens it. */
export function observeRead(run: WorkRun, page: string): WorkRun {
  if (!isRunActive(run)) return run;
  const counted = run.pagesRead.includes(page);
  const line: WorkRunLine = { kind: 'reading', page };
  if (counted && sameLine(line, run.line)) return run;
  return { ...run, line, pagesRead: counted ? run.pagesRead : [...run.pagesRead, page] };
}

/**
 * Ends the run. Where the stage stands the result draws in place, so no card rises over it and
 * nothing waits unseen; a hidden card returns for the result.
 */
export function finishRun(run: WorkRun, outcome: WorkRunOutcome, at: number, stageVisible: boolean): WorkRun {
  if (!isRunActive(run)) return run;
  const phase: WorkRunPhase = outcome.kind === 'report'
    ? (outcome.report.itemCount > 0 ? 'found' : 'clean')
    : outcome.kind;
  const report = outcome.kind === 'report' ? outcome.report : null;
  const card: WorkRunCardState = phase === 'stopped' || stageVisible ? 'closed' : 'open';
  return { ...run, phase, report, endedAt: at, unseen: phase === 'found' && !stageVisible, card };
}

export function hideCard(run: WorkRun): WorkRun {
  return run.card === 'open' && isRunActive(run) ? { ...run, card: 'hidden' } : run;
}

export function closeCard(run: WorkRun): WorkRun {
  return run.card === 'closed' ? run : { ...run, card: 'closed' };
}

/** Opening the results reads them: the badge goes and a finished card has nothing left to say. */
export function markSeen(run: WorkRun): WorkRun {
  if (isRunActive(run)) return run;
  if (!run.unseen && run.card === 'closed') return run;
  return { ...run, unseen: false, card: 'closed' };
}

/** The folder it was reading is gone, so the check ends there and says so once. */
export function abandonRun(run: WorkRun, at: number): WorkRun {
  if (!isRunActive(run)) return run;
  return { ...run, phase: 'failed', endedAt: at, report: null, unseen: false, card: 'open' };
}

export function elapsedMs(run: WorkRun, now: number): number {
  return Math.max(0, (run.endedAt ?? now) - run.startedAt);
}
