import type { MapAnalysis, MapAnalysisRecordState } from '@/shared/lib/vault-document/map-analysis-record';
import { mappingShare, type MappingShareFigures } from '@/shared/lib/vault-document/mapping-share';

/**
 * What the map's analysis chip and its panel say, from the project note's line, the analysis
 * record and whether a press is mapping now (`docs/specs/2026-11-24-map-analysis-record.md`,
 * States). Pure: the hook supplies the clock.
 */

/** Panel rows: the newest analyses, newest first. */
export const MAP_ANALYSIS_ROWS_SHOWN = 5;

/**
 * A line written this recently reads as an analysis still running, as long as the mapping run's
 * own silence limit (`MAPPING_SILENCE_LIMIT_MS` in `features/work-run`): a terminal agent has no
 * press to watch.
 */
export const MAP_ANALYSIS_RUNNING_WINDOW_MS = 10 * 60_000;

const DAY_MS = 24 * 60 * 60_000;

export type MapAnalysisWhen = { kind: 'today' } | { kind: 'yesterday' } | { kind: 'days'; days: number };

export type MapAnalysisPill =
  | { kind: 'full'; percent: number; number: number; when: MapAnalysisWhen }
  | { kind: 'shareOnly'; percent: number }
  | { kind: 'noShare'; number: number; when: MapAnalysisWhen }
  | { kind: 'running'; percent: number };

export interface MapAnalysisRow {
  id: string;
  number: number;
  at: string;
  agent: string | null;
  /** The share the analysis before it left; null for the first one with a count. */
  before: number | null;
  /** The share this analysis left; null when no code was connected. */
  after: number | null;
  added: number;
  changed: number;
}

export interface MapAnalysisChipModel {
  pill: MapAnalysisPill;
  share: { mapped: number; total: number; percent: number } | null;
  /** The latest analysis that counted the share. */
  counted: { number: number; when: MapAnalysisWhen } | null;
  rows: MapAnalysisRow[];
  earlier: number;
  record: MapAnalysisRecordState['kind'];
  /** Abilities still off the map; mapping the rest is offered only above zero. */
  offMap: number;
  /** When the pill stops reading as running unless another line arrives; null when it does not run on the record's time. */
  runningUntilMs: number | null;
}

export interface MapAnalysisChipInput {
  /** The open folder holds a project concept (never the sample map). */
  hasProject: boolean;
  /** The widest `Not mapped yet` line of the folder's project notes. */
  noteFigures: MappingShareFigures | null;
  record: MapAnalysisRecordState;
  /** A press of Map the rest of the code is sending requests for this folder. */
  pressRunning: boolean;
  nowMs: number;
}

/** Calendar days in local time from `atMs` to `nowMs`; a time in the future reads as today. */
export function analysisWhen(atMs: number, nowMs: number): MapAnalysisWhen {
  const at = new Date(atMs);
  at.setHours(0, 0, 0, 0);
  const now = new Date(nowMs);
  now.setHours(0, 0, 0, 0);
  const days = Math.round((now.getTime() - at.getTime()) / DAY_MS);
  if (!Number.isFinite(days) || days <= 0) return { kind: 'today' };
  if (days === 1) return { kind: 'yesterday' };
  return { kind: 'days', days };
}

function figuresOf(analysis: MapAnalysis): MappingShareFigures | null {
  return analysis.abilities ? { abilitiesTotal: analysis.abilities.total, abilitiesUncovered: analysis.abilities.offMap } : null;
}

/** Newest first, each with the share the analysis before it left. O(analyses). */
function rowsOf(analyses: readonly MapAnalysis[]): MapAnalysisRow[] {
  const rows: MapAnalysisRow[] = [];
  let before: number | null = null;
  for (const analysis of analyses) {
    const after = mappingShare(figuresOf(analysis))?.percent ?? null;
    rows.push({
      id: analysis.id,
      number: analysis.number,
      at: analysis.at,
      agent: analysis.agent,
      before: after === null ? null : before,
      after,
      added: analysis.concepts.added,
      changed: analysis.concepts.changed,
    });
    if (after !== null) before = after;
  }
  return rows.reverse();
}

/** Null when the chip is not drawn: no project, or neither a share nor a readable record to speak of. */
export function mapAnalysisChipModel(input: MapAnalysisChipInput): MapAnalysisChipModel | null {
  if (!input.hasProject) return null;
  const analyses = input.record.kind === 'read' ? input.record.analyses : [];
  const latest = analyses.at(-1) ?? null;
  const latestCounted = [...analyses].reverse().find((analysis) => analysis.abilities !== null) ?? null;
  // The note's line wins: it travels with the folder, and a hand edit or merge is newer than the record.
  const share = mappingShare(input.noteFigures) ?? (input.noteFigures === null && latestCounted ? mappingShare(figuresOf(latestCounted)) : null);
  if (share === null && latest === null) return null;

  const latestAtMs = latest ? Date.parse(latest.at) : null;
  // A line dated after the clock is not "now": only a line from the last window counts.
  const sinceLatestMs = latestAtMs === null ? null : input.nowMs - latestAtMs;
  const runningUntilMs =
    latestAtMs !== null && sinceLatestMs !== null && sinceLatestMs >= 0 && sinceLatestMs < MAP_ANALYSIS_RUNNING_WINDOW_MS
      ? latestAtMs + MAP_ANALYSIS_RUNNING_WINDOW_MS
      : null;
  const running = input.pressRunning || runningUntilMs !== null;
  const when = latestAtMs !== null ? analysisWhen(latestAtMs, input.nowMs) : null;

  let pill: MapAnalysisPill;
  if (share !== null && running) pill = { kind: 'running', percent: share.percent };
  else if (share !== null && latest && when) pill = { kind: 'full', percent: share.percent, number: latest.number, when };
  else if (share !== null) pill = { kind: 'shareOnly', percent: share.percent };
  else pill = { kind: 'noShare', number: latest!.number, when: when! };

  const rows = rowsOf(analyses);
  return {
    pill,
    share,
    counted: latestCounted ? { number: latestCounted.number, when: analysisWhen(Date.parse(latestCounted.at), input.nowMs) } : null,
    rows: rows.slice(0, MAP_ANALYSIS_ROWS_SHOWN),
    earlier: Math.max(0, rows.length - MAP_ANALYSIS_ROWS_SHOWN),
    record: input.record.kind,
    offMap: share ? share.total - share.mapped : 0,
    runningUntilMs: input.pressRunning ? null : runningUntilMs,
  };
}
