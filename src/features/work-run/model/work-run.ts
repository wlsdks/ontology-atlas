/**
 * One person-started long run, held by the app session rather than the screen that started it.
 * Every fact here was observed from the agent's turn: no total, percent or estimate exists.
 */

export interface WorkRunToolLabel {
  kind: 'known' | 'kind' | 'raw';
  text: string;
}

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
  handled: ReadonlySet<string>;
}

export interface WorkRun {
  id: number;
  /** The open folder's identity scope; a run never shows under another folder. */
  folder: string;
  /** The conversation running the turn; only it may report the turn's Stop and facts. */
  owner: string;
  agent: string;
  startedAt: number;
  endedAt: number | null;
  phase: WorkRunPhase;
  line: WorkRunLine;
  /** Append-only and shared by every snapshot of this run; `readCount` is what changes. */
  pagesRead: ReadonlySet<string>;
  readCount: number;
  report: WorkRunReport | null;
  /** The last readable report before this run, which a run that reports nothing leaves standing. */
  previousReport: WorkRunReport | null;
  unseen: boolean;
  card: WorkRunCardState;
}

export type WorkRunOutcome =
  | { kind: 'stopped' }
  | { kind: 'failed' }
  | { kind: 'unreadable' }
  | { kind: 'report'; report: Omit<WorkRunReport, 'handled'> };

export function isRunActive(run: WorkRun | null): boolean {
  return run !== null && (run.phase === 'running' || run.phase === 'asking');
}

export function latestReport(run: WorkRun | null): WorkRunReport | null {
  return run ? run.report ?? run.previousReport : null;
}

export function beginRun(
  input: { id: number; folder: string; owner: string; agent: string; startedAt: number },
  previous: WorkRun | null,
): WorkRun {
  return {
    ...input,
    endedAt: null,
    phase: 'running',
    line: { kind: 'connecting' },
    pagesRead: new Set(),
    readCount: 0,
    report: null,
    previousReport: previous?.folder === input.folder ? latestReport(previous) : null,
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

/**
 * A completed read names its file and counts it once, however often the agent opens it. O(1):
 * the run's set grows in place, since copying it per read would make a long check quadratic.
 */
export function observeRead(run: WorkRun, page: string): WorkRun {
  if (!isRunActive(run)) return run;
  const counted = run.pagesRead.has(page);
  const line: WorkRunLine = { kind: 'reading', page };
  if (counted && sameLine(line, run.line)) return run;
  if (!counted) (run.pagesRead as Set<string>).add(page);
  return { ...run, line, readCount: run.pagesRead.size };
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
  const report = outcome.kind === 'report' ? { ...outcome.report, handled: new Set<string>() } : null;
  const card: WorkRunCardState = phase === 'stopped' || stageVisible ? 'closed' : 'open';
  return { ...run, phase, report, endedAt: at, unseen: phase === 'found' && !stageVisible, card };
}

export function hideCard(run: WorkRun): WorkRun {
  return run.card === 'open' && isRunActive(run) ? { ...run, card: 'hidden' } : run;
}

export function closeCard(run: WorkRun): WorkRun {
  return run.card === 'closed' ? run : { ...run, card: 'closed' };
}

export function markSeen(run: WorkRun): WorkRun {
  if (isRunActive(run)) return run;
  if (!run.unseen && run.card === 'closed') return run;
  return { ...run, unseen: false, card: 'closed' };
}

export function abandonRun(run: WorkRun, at: number): WorkRun {
  if (!isRunActive(run)) return run;
  return { ...run, phase: 'failed', endedAt: at, report: null, unseen: false, card: 'open' };
}

export function markHandled(run: WorkRun, key: string): WorkRun {
  const report = latestReport(run);
  if (!report || report.handled.has(key)) return run;
  const next = { ...report, handled: new Set([...report.handled, key]) };
  return run.report ? { ...run, report: next } : { ...run, previousReport: next };
}

export function elapsedMs(run: Pick<WorkRun, 'startedAt' | 'endedAt'>, now: number): number {
  return Math.max(0, (run.endedAt ?? now) - run.startedAt);
}
