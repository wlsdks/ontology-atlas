import { ABILITIES_ONE_REQUEST_REACHES, estimateRequests, type MappingRequestResult } from '@/shared/lib/vault-document/mapping-estimate';
import type { NotMappedAreas } from '@/shared/lib/vault-document/not-mapped-areas';

import type { TurnRunLine, TurnWorkReport } from './turn-run';
import type { WorkRunCardState } from './work-run';

/**
 * One press that sends request after request to an agent until every ability found in the code is
 * on the map (`docs/specs/2026-11-23-one-press-maps-the-rest.md`). Held by the app session, never
 * persisted: after a quit the project note's summary line is where a new run starts.
 */

export type MappingRunPhase = 'running' | 'asking' | 'stopping' | 'finished' | 'stopped';

/** `cancelled` is a cancel nobody pressed Stop for: a turn's baseline refused it, another conversation was opened, or its panel went. */
export type MappingStopReason = 'press' | 'cancelled' | 'message' | 'noProgress' | 'pastEstimate' | 'lineLost' | 'agentError' | 'usageLimit' | 'switched';

/**
 * The summary line of the run's project note. A folder with several projects runs on one, the one
 * with the most abilities off the map at the press; display, progress and estimate all read it.
 */
export type MappingFigures = Pick<NotMappedAreas, 'abilitiesUncovered' | 'abilitiesTotal'>;

/** `usageLimit` is `readAcpTrouble(error).kind === 'limit'`, the classifier behind `acpChat.trouble.limit`. */
export type MappingTurnOutcome = { kind: 'completed' } | { kind: 'cancelled' } | { kind: 'failed'; usageLimit: boolean };

export interface MappingRequestEnd {
  outcome: MappingTurnOutcome;
  /** The project's line read from disk after the turn ended; null when the note holds none. */
  figures: MappingFigures | null;
  /** The note could not be read at all, which says nothing about what is left. */
  unreadable?: boolean;
  /** The project whose line `figures` is, for a run begun before any project had one. */
  project?: string;
  /** The composer holds text the person typed. */
  draft: boolean;
  at: number;
  /** The agent's conversation the request ran in; absent for a request that never reached the agent, which is not counted. */
  sessionId?: string;
}

/** One finished request: what it put on the map, how long it took, and the conversation to read it in. */
export interface MappingFinishedRequest extends MappingRequestResult {
  sessionId: string;
}

export interface MappingRun {
  id: number;
  folder: string;
  folderName: string;
  /** The project note the run reads, fixed at the press; null when the folder had no line then. */
  project: string | null;
  agent: string;
  phase: MappingRunPhase;
  /** Pending while stopping, final once stopped; null otherwise. */
  stopReason: MappingStopReason | null;
  /** Requests sent so far, the one running included. */
  requestsSent: number;
  /** Requests estimated at the press. */
  estimate: number;
  start: MappingFigures | null;
  now: MappingFigures | null;
  startedAt: number;
  requestStartedAt: number;
  endedAt: number | null;
  finished: readonly MappingFinishedRequest[];
  line: TurnRunLine;
  /** When the agent last reported; an unchanged line refreshes it at most once a step. */
  heardAt: number;
  card: WorkRunCardState;
}

export type MappingNextStep = { kind: 'continue' } | { kind: 'finished' } | { kind: 'stopped'; reason: MappingStopReason };

/** No report from the agent for this long, outside a permission wait, ends the request. */
export const MAPPING_SILENCE_LIMIT_MS = 10 * 60_000;

/** An unchanged line republishes the run no more often than this, so a quiet read never ticks the card. */
const HEARD_STEP_MS = 60_000;

/** No press sends more requests than this, whatever the note says is left. */
export const MAPPING_REQUESTS_AT_MOST = 100;

/** The run stops before a request beyond twice the estimate plus two, or beyond the ceiling, would be sent. */
const requestCap = (estimate: number) => Math.min(2 * estimate + 2, MAPPING_REQUESTS_AT_MOST);

export function isMappingActive(run: MappingRun): boolean {
  return run.phase === 'running' || run.phase === 'asking' || run.phase === 'stopping';
}

/**
 * The id every request of one press hands the MCP server, so the map analysis record
 * (`.ontology-atlas/map-analysis.jsonl`) reads the press as one analysis. Unique across
 * launches because it carries the press's time.
 */
export function mappingAnalysisId(run: Pick<MappingRun, 'id' | 'startedAt'>): string {
  return `press-${run.startedAt}-${run.id}`;
}

export function beginMappingRun(input: {
  id: number;
  folder: string;
  folderName: string;
  project: string | null;
  agent: string;
  figures: MappingFigures | null;
  startedAt: number;
}): MappingRun {
  const { figures, startedAt, ...identity } = input;
  return {
    ...identity,
    phase: 'running',
    stopReason: null,
    requestsSent: 1,
    estimate: estimateRequests(figures?.abilitiesUncovered ?? 0),
    start: figures,
    now: figures,
    startedAt,
    requestStartedAt: startedAt,
    endedAt: null,
    finished: [],
    line: { kind: 'connecting' },
    heardAt: startedAt,
    card: 'open',
  };
}

function lineFor(current: TurnRunLine, work: TurnWorkReport): TurnRunLine {
  if (work.kind === 'answering') return { kind: 'answering' };
  if (work.kind === 'writing' && work.target) return { kind: 'writingFile', file: work.target };
  if (work.kind === 'reading' && work.target) return { kind: 'reading', page: work.target };
  if (work.label && work.label.text) return { kind: 'tool', label: work.label };
  return current;
}

const sameLine = (a: TurnRunLine, b: TurnRunLine) => JSON.stringify(a) === JSON.stringify(b);

/** A permission request turns the run to asking and brings back a hidden card; Stop holds it at stopping. */
export function observeMappingWork(run: MappingRun, work: TurnWorkReport | null, at: number): MappingRun {
  if (!isMappingActive(run) || work === null) return run;
  const phase: MappingRunPhase = run.phase === 'stopping' ? 'stopping' : work.asking ? 'asking' : 'running';
  const line = lineFor(run.line, work);
  const changed = phase !== run.phase || !sameLine(line, run.line);
  if (!changed && at - run.heardAt < HEARD_STEP_MS) return run;
  const card: WorkRunCardState = phase === 'asking' && run.phase !== 'asking' && run.card === 'hidden' ? 'open' : run.card;
  return { ...run, phase, line: sameLine(line, run.line) ? run.line : line, heardAt: at, card };
}

/** What can stop a run from outside its request's end: a press, the person's own message, a folder switch. */
export type MappingStopCause = Extract<MappingStopReason, 'press' | 'message' | 'switched'>;

/** Holds the run at stopping until its request ends; a folder switch outranks a press or a message. */
export function stopMappingRun(run: MappingRun, reason: MappingStopCause): MappingRun {
  if (!isMappingActive(run)) return run;
  const stopReason = run.stopReason === 'switched' ? 'switched' : reason;
  if (run.phase === 'stopping' && run.stopReason === stopReason) return run;
  return { ...run, phase: 'stopping', stopReason, card: stopReason === 'switched' || run.card === 'closed' ? 'open' : run.card };
}

/**
 * The line is gone: the agent drops it once nothing is left, so that reads as finished only when
 * one request could have mapped what the line last said was left.
 */
function lineGoneStep(run: MappingRun): MappingNextStep {
  const lastLeft = run.now?.abilitiesUncovered;
  return lastLeft !== undefined && lastLeft <= ABILITIES_ONE_REQUEST_REACHES ? { kind: 'finished' } : { kind: 'stopped', reason: 'lineLost' };
}

/**
 * What follows a request's end, the first rule that holds deciding: a Stop, a failed turn, the
 * line gone or at zero, no fewer abilities off the map, the request cap, a draft in the composer.
 */
export function nextMappingStep(run: MappingRun, end: MappingRequestEnd): MappingNextStep {
  if (run.phase === 'stopping') return { kind: 'stopped', reason: run.stopReason ?? 'press' };
  if (end.outcome.kind === 'cancelled') return { kind: 'stopped', reason: 'cancelled' };
  if (end.outcome.kind === 'failed') return { kind: 'stopped', reason: end.outcome.usageLimit ? 'usageLimit' : 'agentError' };
  if (end.unreadable) return { kind: 'stopped', reason: 'lineLost' };
  if (end.figures === null) return lineGoneStep(run);
  if (end.figures.abilitiesUncovered === 0) return { kind: 'finished' };
  if (run.now !== null && end.figures.abilitiesUncovered >= run.now.abilitiesUncovered) return { kind: 'stopped', reason: 'noProgress' };
  if (run.requestsSent >= requestCap(run.estimate)) return { kind: 'stopped', reason: 'pastEstimate' };
  if (end.draft) return { kind: 'stopped', reason: 'message' };
  return { kind: 'continue' };
}

/** Ends the running request and returns the run that follows; `running` means send the next request. */
export function afterRequest(run: MappingRun, end: MappingRequestEnd): MappingRun {
  if (!isMappingActive(run)) return run;
  const step = nextMappingStep(run, end);
  const before = run.now?.abilitiesUncovered;
  const after = end.figures?.abilitiesUncovered;
  const gained = before === undefined || after === undefined ? 0 : before - after;
  // A request that never reached the agent did nothing: it is neither listed nor counted as sent.
  const { sessionId } = end;
  // A run begun before any project had a line takes the first one read, and estimates from it.
  const adopted = run.project === null && end.project !== undefined && end.figures !== null
    ? { project: end.project, figures: end.figures }
    : null;
  const ended: MappingRun = {
    ...run,
    project: adopted?.project ?? run.project,
    estimate: adopted ? run.requestsSent + estimateRequests(adopted.figures.abilitiesUncovered) : run.estimate,
    now: end.figures ?? run.now,
    requestsSent: sessionId !== undefined ? run.requestsSent : Math.max(0, run.requestsSent - 1),
    finished: sessionId !== undefined
      ? [...run.finished, { gained, durationMs: Math.max(0, end.at - run.requestStartedAt), sessionId }]
      : run.finished,
  };
  if (step.kind === 'continue') {
    return {
      ...ended,
      phase: 'running',
      requestsSent: ended.requestsSent + 1,
      requestStartedAt: end.at,
      line: { kind: 'connecting' },
      heardAt: end.at,
    };
  }
  return {
    ...ended,
    phase: step.kind === 'finished' ? 'finished' : 'stopped',
    stopReason: step.kind === 'stopped' ? step.reason : null,
    endedAt: end.at,
    card: 'open',
  };
}

/** True when a request has heard nothing from the agent for the limit; a permission wait has no clock. */
export function silentTooLong(run: MappingRun, now: number): boolean {
  return run.phase === 'running' && now - run.heardAt >= MAPPING_SILENCE_LIMIT_MS;
}

/** Abilities on the map over those found, within 0..1; null before any line was read or for one that cannot be true. */
export function mappingFraction(run: MappingRun): number | null {
  if (run.phase === 'finished') return 1;
  const figures = run.now ?? run.start;
  if (figures === null) return null;
  const { abilitiesTotal, abilitiesUncovered } = figures;
  if (!(abilitiesTotal > 0) || !Number.isFinite(abilitiesTotal) || !Number.isFinite(abilitiesUncovered)) return null;
  return Math.min(1, Math.max(0, (abilitiesTotal - abilitiesUncovered) / abilitiesTotal));
}

export function hideMappingCard(run: MappingRun): MappingRun {
  return run.card === 'open' && isMappingActive(run) ? { ...run, card: 'hidden' } : run;
}

export function closeMappingCard(run: MappingRun): MappingRun {
  return run.card === 'closed' ? run : { ...run, card: 'closed' };
}
