/**
 * The map analysis record, `.ontology-atlas/map-analysis.jsonl`, as the app reads
 * it (`docs/specs/2026-11-24-map-analysis-record.md`). Only the MCP server writes
 * it (`mcp/src/vault/sidecar/map-analysis-log.mjs`); the app never does.
 * `tests/fixtures/map-analysis-line-cases.mjs` holds both readers to one answer.
 */

export const MAP_ANALYSIS_RECORD_FOLDER = '.ontology-atlas';
export const MAP_ANALYSIS_RECORD_FILE = 'map-analysis.jsonl';
export const MAP_ANALYSIS_RECORD_PATH = `${MAP_ANALYSIS_RECORD_FOLDER}/${MAP_ANALYSIS_RECORD_FILE}`;

/** The most of the file the app reads, from its end, on both surfaces; the app's own tail reader caps at the same 1 MiB. */
export const MAP_ANALYSIS_READ_MAX_BYTES = 1024 * 1024;

/** Lines the app's tail read asks for: more than the server keeps after a fold (2,000). */
export const MAP_ANALYSIS_READ_MAX_LINES = 10_000;

/** The record as the map reads it: no file, a file no line of which parses, or its analyses. */
export type MapAnalysisRecordState =
  | { kind: 'absent' }
  | { kind: 'unreadable' }
  | { kind: 'read'; analyses: MapAnalysis[] };

export const ABSENT_MAP_ANALYSIS_RECORD: MapAnalysisRecordState = { kind: 'absent' };
export const UNREADABLE_MAP_ANALYSIS_RECORD: MapAnalysisRecordState = { kind: 'unreadable' };

/** `text` is null when the file is absent; a file in which no line parses is unreadable. */
export function mapAnalysisRecordFromText(text: string | null, nowMs = Date.now()): MapAnalysisRecordState {
  if (text === null) return ABSENT_MAP_ANALYSIS_RECORD;
  const { analyses } = readMapAnalyses(text, { nowMs });
  return analyses.length === 0 ? UNREADABLE_MAP_ANALYSIS_RECORD : { kind: 'read', analyses };
}

/** The whole lines of a file's last bytes: the first line is cut unless the read began at the file's start. */
export function wholeLinesOfTail(text: string, startedMidFile: boolean): string {
  if (!startedMidFile) return text;
  const lineStart = text.indexOf('\n');
  return lineStart === -1 ? '' : text.slice(lineStart + 1);
}

export interface MapAnalysisShare {
  total: number;
  offMap: number;
}

export interface MapAnalysisAreas {
  total: number;
  notMapped: number;
}

export interface MapAnalysisConcepts {
  added: number;
  changed: number;
  removed: number;
}

export interface MapAnalysis {
  id: string;
  number: number;
  origin: 'press' | 'session';
  startedAt: string;
  at: string;
  agent: string | null;
  sourceCommit: string | null;
  sourceDirty: boolean | null;
  abilities: MapAnalysisShare | null;
  areas: MapAnalysisAreas | null;
  concepts: MapAnalysisConcepts;
  sessions: number;
}

export interface MapAnalysisRead {
  analyses: MapAnalysis[];
  broken: number;
}

interface MapAnalysisLine {
  analysis: string;
  session: string;
  number: number;
  origin: 'press' | 'session';
  startedAt: string;
  at: string;
  agent: string | null;
  sourceCommit: string | null;
  sourceDirty: boolean | null;
  abilities: MapAnalysisShare | null;
  areas: MapAnalysisAreas | null;
  concepts: MapAnalysisConcepts;
}

const ID_PATTERN = /^[A-Za-z0-9._-]{1,80}$/;
const COMMIT_PATTERN = /^[0-9a-f]{7,64}$/i;
/** The runtime id shape the heartbeat writer enforces; free text may hold a path or code. */
const AGENT_PATTERN = /^[a-z0-9][a-z0-9._-]{0,99}$/i;
/** The earliest time a line may carry; Atlas wrote none before it. */
const EARLIEST_LINE_MS = Date.UTC(2020, 0, 1);
/** How far past the reader's clock a line may be dated, for clocks that disagree a little. */
const FUTURE_SKEW_MS = 24 * 60 * 60_000;
/** The largest count or analysis number a line may hold. */
const COUNT_MAX = 1_000_000_000;

function isCount(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0 && (value as number) <= COUNT_MAX;
}

function readTimeMs(value: unknown, nowMs: number): number | null {
  if (typeof value !== 'string') return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) && ms >= EARLIEST_LINE_MS && ms <= nowMs + FUTURE_SKEW_MS ? ms : null;
}

function readAgent(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return AGENT_PATTERN.test(trimmed) ? trimmed : null;
}

function readShare(value: unknown): MapAnalysisShare | null {
  if (!value || typeof value !== 'object') return null;
  const { total, offMap } = value as Record<string, unknown>;
  return isCount(total) && isCount(offMap) && offMap <= total ? { total, offMap } : null;
}

function readAreas(value: unknown): MapAnalysisAreas | null {
  if (!value || typeof value !== 'object') return null;
  const { total, notMapped } = value as Record<string, unknown>;
  return isCount(total) && isCount(notMapped) && notMapped <= total ? { total, notMapped } : null;
}

function parseLine(text: string, nowMs: number): MapAnalysisLine | null {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (!raw || typeof raw !== 'object') return null;
  const fields = raw as Record<string, unknown>;
  if (fields.v !== 1) return null;
  const { analysis, session, number } = fields;
  if (typeof analysis !== 'string' || !ID_PATTERN.test(analysis)) return null;
  if (typeof session !== 'string' || !ID_PATTERN.test(session)) return null;
  if (!isCount(number) || number < 1) return null;
  const atMs = readTimeMs(fields.at, nowMs);
  if (atMs === null) return null;
  const startedAtMs = readTimeMs(fields.startedAt, nowMs) ?? atMs;
  const concepts = fields.concepts && typeof fields.concepts === 'object' ? (fields.concepts as Record<string, unknown>) : {};
  return {
    analysis,
    session,
    number,
    origin: fields.origin === 'press' ? 'press' : 'session',
    startedAt: new Date(Math.min(startedAtMs, atMs)).toISOString(),
    at: new Date(atMs).toISOString(),
    agent: readAgent(fields.agent),
    sourceCommit:
      typeof fields.sourceCommit === 'string' && COMMIT_PATTERN.test(fields.sourceCommit) ? fields.sourceCommit.toLowerCase() : null,
    sourceDirty: typeof fields.sourceDirty === 'boolean' ? fields.sourceDirty : null,
    abilities: readShare(fields.abilities),
    areas: readAreas(fields.areas),
    concepts: {
      added: isCount(concepts.added) ? concepts.added : 0,
      changed: isCount(concepts.changed) ? concepts.changed : 0,
      removed: isCount(concepts.removed) ? concepts.removed : 0,
    },
  };
}

/**
 * The record's lines as analyses: the last line of each session within an
 * analysis, summed per analysis, in the order each analysis first appears and
 * numbered on from the first line's `number`; the latest line gives an
 * analysis's share, commit and agent. A line dated before 2020 or more than a
 * day past `nowMs` does not parse. O(lines).
 */
export function readMapAnalyses(text: string, { nowMs = Date.now() }: { nowMs?: number } = {}): MapAnalysisRead {
  const sessionsByAnalysis = new Map<string, Map<string, MapAnalysisLine>>();
  let broken = 0;
  let firstNumber: number | null = null;
  for (const rawLine of text.split('\n')) {
    if (!rawLine.trim()) continue;
    const line = parseLine(rawLine, nowMs);
    if (!line) {
      broken += 1;
      continue;
    }
    firstNumber ??= line.number;
    const sessions = sessionsByAnalysis.get(line.analysis) ?? new Map<string, MapAnalysisLine>();
    sessions.set(line.session, line);
    sessionsByAnalysis.set(line.analysis, sessions);
  }
  const analyses = [...sessionsByAnalysis].map(([id, sessionLines], index): MapAnalysis => {
    const sessions = [...sessionLines.values()];
    const latest = sessions.reduce((last, line) => (Date.parse(line.at) >= Date.parse(last.at) ? line : last));
    const startedAt = sessions.reduce((first, line) => (line.startedAt < first ? line.startedAt : first), latest.startedAt);
    const concepts = { added: 0, changed: 0, removed: 0 };
    for (const line of sessions) {
      concepts.added += line.concepts.added;
      concepts.changed += line.concepts.changed;
      concepts.removed += line.concepts.removed;
    }
    return {
      id,
      number: (firstNumber ?? 1) + index,
      origin: latest.origin,
      startedAt,
      at: latest.at,
      agent: latest.agent,
      sourceCommit: latest.sourceCommit,
      sourceDirty: latest.sourceDirty,
      abilities: latest.abilities,
      areas: latest.areas,
      concepts,
      sessions: sessions.length,
    };
  });
  return { analyses, broken };
}
