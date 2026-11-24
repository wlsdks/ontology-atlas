// The map analysis record, `.ontology-atlas/map-analysis.jsonl`: one line per
// agent session's write, counts only (`docs/specs/2026-11-24-map-analysis-record.md`).
// Only this server writes it; the app reads it (`map-analysis-record.ts`), and
// `tests/fixtures/map-analysis-line-cases.mjs` holds both readers to one answer.

import { randomUUID } from 'node:crypto';

import {
  appendVaultSidecarLine,
  readVaultSidecarTail,
  readVaultSidecarText,
  replaceVaultSidecarText,
} from './vault-sidecar.mjs';

export const MAP_ANALYSIS_FILENAME = 'map-analysis.jsonl';
const HEARTBEAT_FILENAME = 'agent-activity.json';

/** A session whose next write comes later than this after its last begins a new analysis (spec decision 1). */
export const ANALYSIS_GAP_MS = 60 * 60_000;

/** A fold keeps this many sessions, newest last: about 0.8 MB at 400 bytes a line, inside both readers' bound. */
export const RECORD_SESSIONS_KEPT = 2000;

/** The most of the file one read takes, from its end; the app's tail read is bounded the same way. */
const RECORD_READ_MAX_BYTES = 1024 * 1024;

/** The earliest time a line may carry; Atlas wrote none before it. */
const EARLIEST_LINE_MS = Date.UTC(2020, 0, 1);
/** How far past the reader's clock a line may be dated, for clocks that disagree a little. */
const FUTURE_SKEW_MS = 24 * 60 * 60_000;
/** The largest count or analysis number a line may hold; past it a line is not believed. */
const COUNT_MAX = 1_000_000_000;
/** A press id in the heartbeat holds for at most this long past now, whatever `until` says; the app writes 15 minutes. */
const PRESS_MAX_AHEAD_MS = 15 * 60_000;
/** A fold carries at most this many lines it cannot parse, the newest, so junk never pushes sessions out. */
const RECORD_BROKEN_LINES_KEPT = 200;
/** The presses one process can return to and go on counting, the most recent kept. */
const PRESSES_REMEMBERED = 16;

const ID_PATTERN = /^[A-Za-z0-9._-]{1,80}$/;
const COMMIT_PATTERN = /^[0-9a-f]{7,64}$/i;
/** The runtime id shape the app's heartbeat writer enforces (`acp-agent-heartbeat.ts`). */
const AGENT_PATTERN = /^[a-z0-9][a-z0-9._-]{0,99}$/i;

function isCount(value) {
  return Number.isSafeInteger(value) && value >= 0 && value <= COUNT_MAX;
}

/** An agent name only when it is shaped like a runtime id; free text may hold a path or code. */
export function mapAnalysisAgent(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return AGENT_PATTERN.test(trimmed) ? trimmed : null;
}

function readTime(value, nowMs) {
  if (typeof value !== 'string') return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) && ms >= EARLIEST_LINE_MS && ms <= nowMs + FUTURE_SKEW_MS ? ms : null;
}

function readPair(value, totalKey, partKey) {
  if (!value || typeof value !== 'object') return null;
  const total = value[totalKey];
  const part = value[partKey];
  return isCount(total) && isCount(part) && part <= total ? { [totalKey]: total, [partKey]: part } : null;
}

/**
 * One line as both readers take it, or null when it is not a version 1 line: an
 * id, a session, a number up to `COUNT_MAX` and a time between 2020 and a day past
 * `nowMs` are required; every other field falls back (`origin` to `session`, a
 * count to 0, the rest to null).
 */
function parseMapAnalysisLine(text, nowMs) {
  let raw;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (!raw || typeof raw !== 'object' || raw.v !== 1) return null;
  const { analysis, session, number } = raw;
  if (typeof analysis !== 'string' || !ID_PATTERN.test(analysis)) return null;
  if (typeof session !== 'string' || !ID_PATTERN.test(session)) return null;
  if (!isCount(number) || number < 1) return null;
  const atMs = readTime(raw.at, nowMs);
  if (atMs === null) return null;
  const startedAtMs = readTime(raw.startedAt, nowMs) ?? atMs;
  const concepts = raw.concepts && typeof raw.concepts === 'object' ? raw.concepts : {};
  return {
    analysis,
    session,
    number,
    origin: raw.origin === 'press' ? 'press' : 'session',
    startedAt: new Date(Math.min(startedAtMs, atMs)).toISOString(),
    at: new Date(atMs).toISOString(),
    agent: mapAnalysisAgent(raw.agent),
    sourceCommit: typeof raw.sourceCommit === 'string' && COMMIT_PATTERN.test(raw.sourceCommit) ? raw.sourceCommit.toLowerCase() : null,
    sourceDirty: typeof raw.sourceDirty === 'boolean' ? raw.sourceDirty : null,
    abilities: readPair(raw.abilities, 'total', 'offMap'),
    areas: readPair(raw.areas, 'total', 'notMapped'),
    concepts: {
      added: isCount(concepts.added) ? concepts.added : 0,
      changed: isCount(concepts.changed) ? concepts.changed : 0,
      removed: isCount(concepts.removed) ? concepts.removed : 0,
    },
  };
}

/**
 * The record's lines read as analyses: the last line of each session within an
 * analysis, summed per analysis, analyses in the order their first line appears
 * and numbered on from the first line's `number`. The latest line of an analysis
 * gives its counts, commit and agent. `broken` counts lines that do not parse. O(lines).
 */
export function readMapAnalyses(text, { nowMs = Date.now() } = {}) {
  const latestBySession = new Map();
  const order = [];
  let broken = 0;
  let firstNumber = null;
  for (const rawLine of String(text ?? '').split('\n')) {
    if (!rawLine.trim()) continue;
    const line = parseMapAnalysisLine(rawLine, nowMs);
    if (!line) {
      broken += 1;
      continue;
    }
    firstNumber ??= line.number;
    if (!latestBySession.has(line.analysis)) {
      latestBySession.set(line.analysis, new Map());
      order.push(line.analysis);
    }
    latestBySession.get(line.analysis).set(line.session, line);
  }
  const analyses = order.map((id, index) => {
    const sessions = [...latestBySession.get(id).values()];
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
      number: firstNumber + index,
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

/**
 * Every session's last line, sessions in the order they first appear, and the
 * newest `RECORD_BROKEN_LINES_KEPT` lines that do not parse kept verbatim where
 * they stood, the newest `RECORD_SESSIONS_KEPT` entries in all. O(lines).
 */
function foldMapAnalysisLines(text, nowMs) {
  const kept = new Map();
  let index = 0;
  for (const rawLine of String(text ?? '').split('\n')) {
    index += 1;
    const trimmed = rawLine.trim();
    if (!trimmed) continue;
    const line = parseMapAnalysisLine(trimmed, nowMs);
    // Setting an existing key keeps its first place, so analyses keep their order.
    kept.set(line ? `${line.analysis}\0${line.session}` : `\0${index}`, trimmed);
  }
  let brokenLeft = [...kept.keys()].filter((key) => key.startsWith('\0')).length;
  const lines = [];
  for (const [key, line] of kept) {
    if (key.startsWith('\0') && brokenLeft-- > RECORD_BROKEN_LINES_KEPT) continue;
    lines.push(line);
  }
  return lines.slice(-RECORD_SESSIONS_KEPT);
}

function pressOf(heartbeat, nowMs) {
  const press = heartbeat?.mapAnalysis;
  if (!press || typeof press.id !== 'string' || !ID_PATTERN.test(press.id)) return null;
  const untilMs = typeof press.until === 'string' ? Date.parse(press.until) : Number.NaN;
  return untilMs > nowMs && untilMs <= nowMs + PRESS_MAX_AHEAD_MS ? press.id : null;
}

/**
 * The press id the app's heartbeat names for the request running now, or null:
 * the id must be id-shaped and its `until` in the future, at most 15 minutes
 * ahead. Undefined when the file could not be read or parsed twice running: the
 * app replaces it at every tool call, so a failed read says nothing about the press.
 */
export function readHeartbeatPress(vaultRoot, nowMs, { readText = readVaultSidecarText } = {}) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    let heartbeat;
    try {
      const stored = readText(vaultRoot, HEARTBEAT_FILENAME);
      if (!stored) return null;
      heartbeat = JSON.parse(stored.text);
    } catch {
      continue;
    }
    return pressOf(heartbeat, nowMs);
  }
  return undefined;
}

function emptyConcepts() {
  return { added: new Set(), changed: new Set(), removed: new Set() };
}

/** What one write did, as slugs; a concept added and then removed in one analysis counts in neither. */
function applyEffect(concepts, effect) {
  for (const slug of effect.added) {
    concepts.removed.delete(slug);
    concepts.added.add(slug);
  }
  for (const slug of effect.changed) {
    if (!concepts.added.has(slug)) concepts.changed.add(slug);
  }
  for (const slug of effect.removed) {
    concepts.changed.delete(slug);
    if (concepts.added.delete(slug)) continue;
    concepts.removed.add(slug);
  }
}

function effectIsEmpty(effect) {
  return !effect || (effect.added.length === 0 && effect.changed.length === 0 && effect.removed.length === 0);
}

const NO_COUNTS = Object.freeze({ sourceCommit: null, sourceDirty: null, abilities: null, areas: null });

function countsOf(analysis) {
  if (!analysis) return NO_COUNTS;
  const { sourceCommit, sourceDirty, abilities, areas } = analysis;
  return { sourceCommit, sourceDirty, abilities, areas };
}

const SIDECAR_IO = {
  readTail: (vaultRoot) => readVaultSidecarTail(vaultRoot, MAP_ANALYSIS_FILENAME, RECORD_READ_MAX_BYTES),
  append: (vaultRoot, line) => appendVaultSidecarLine(vaultRoot, MAP_ANALYSIS_FILENAME, line),
  replace: (vaultRoot, text, expectedRevision) => replaceVaultSidecarText(vaultRoot, MAP_ANALYSIS_FILENAME, text, { expectedRevision }),
};

/**
 * One server process's writer. The file is read only when an analysis begins:
 * the session's first write, its first after `ANALYSIS_GAP_MS`, or the first
 * whose press id differs from the last. That read folds earlier sessions to their
 * last line in one atomic replace; every other write is one appended line.
 * `readPress` answers the press id of the request running now (null outside a
 * press, undefined when it could not tell, which keeps the press of the last
 * write), so one press's requests read as one analysis whatever server they use.
 * A process that returns to a press it wrote under goes on counting its concepts.
 */
export function createMapAnalysisRecorder({
  vaultRoot,
  readPress = (nowMs) => readHeartbeatPress(vaultRoot, nowMs),
  sessionId = randomUUID(),
  now = () => Date.now(),
  newId = randomUUID,
  io = SIDECAR_IO,
}) {
  let current = null;
  const presses = new Map();

  function begin(atMs, press) {
    let stored = null;
    try {
      stored = io.readTail(vaultRoot);
    } catch {
      stored = null;
    }
    const { analyses } = readMapAnalyses(stored?.text ?? '', { nowMs: atMs });
    const pressed = press ? analyses.find((analysis) => analysis.id === press) : undefined;
    const counts = current?.counts ?? countsOf(pressed ?? analyses.at(-1));
    const resumed = press ? presses.get(press) : undefined;
    current = resumed ?? {
      id: press ?? newId(),
      press,
      number: Math.min(COUNT_MAX, pressed?.number ?? (analyses.at(-1)?.number ?? 0) + 1),
      startedAtMs: atMs,
      lastAtMs: atMs,
      concepts: emptyConcepts(),
    };
    current.counts = counts;
    // An unterminated last line would swallow the next one.
    current.lead = stored && !stored.endsWithNewline ? '\n' : '';
    if (press) {
      presses.delete(press);
      presses.set(press, current);
      if (presses.size > PRESSES_REMEMBERED) presses.delete(presses.keys().next().value);
    }
    return stored ? { lines: foldMapAnalysisLines(stored.text, atMs), revision: stored.revision } : null;
  }

  /**
   * Records one write. `measure` is called once for a write that may move the
   * share; a write that cannot (a relation) passes null and keeps the last counts.
   * Returns whether a line was written. Never throws.
   */
  function record({ effect, agent = null, measure }) {
    try {
      if (effectIsEmpty(effect)) return false;
      const atMs = now();
      let read;
      try {
        read = readPress(atMs);
      } catch {
        read = undefined;
      }
      const press = read === undefined ? (current?.press ?? null) : read;
      const startsAnalysis =
        current === null || press !== current.press || (press === null && atMs - current.lastAtMs > ANALYSIS_GAP_MS);
      const fold = startsAnalysis ? begin(atMs, press) : null;
      applyEffect(current.concepts, effect);
      current.lastAtMs = Math.max(current.lastAtMs, atMs);
      if (typeof measure === 'function') current.counts = measure();
      const { counts } = current;
      const line = JSON.stringify({
        v: 1,
        analysis: current.id,
        number: current.number,
        session: sessionId,
        origin: press ? 'press' : 'session',
        startedAt: new Date(current.startedAtMs).toISOString(),
        at: new Date(atMs).toISOString(),
        agent: mapAnalysisAgent(agent),
        sourceCommit: counts.sourceCommit,
        sourceDirty: counts.sourceDirty,
        abilities: counts.abilities,
        areas: counts.areas,
        concepts: {
          added: current.concepts.added.size,
          changed: current.concepts.changed.size,
          removed: current.concepts.removed.size,
        },
      });
      if (fold) {
        try {
          io.replace(vaultRoot, `${[...fold.lines, line].join('\n')}\n`, fold.revision);
          current.lead = '';
          return true;
        } catch {
          // Another session changed the file since it was read: append instead.
        }
      }
      io.append(vaultRoot, `${current.lead}${line}`);
      current.lead = '';
      return true;
    } catch {
      return false;
    }
  }

  return { record, sessionId };
}
