// The map analysis record, `.ontology-atlas/map-analysis.jsonl`: one line per
// agent session's write, counts only (`docs/specs/2026-11-24-map-analysis-record.md`).
// Only this server writes it; the app reads it (`map-analysis-record.ts`), and
// `tests/fixtures/map-analysis-line-cases.mjs` holds both readers to one answer.

import { randomUUID } from 'node:crypto';

import {
  appendVaultSidecarLine,
  readVaultSidecarTail,
  replaceVaultSidecarText,
} from './vault-sidecar.mjs';

export const MAP_ANALYSIS_FILENAME = 'map-analysis.jsonl';

/** A session whose next write comes later than this after its last begins a new analysis (spec decision 1). */
export const ANALYSIS_GAP_MS = 60 * 60_000;

/** A fold keeps this many sessions, newest last: about 0.8 MB at 400 bytes a line, inside both readers' bound. */
export const RECORD_SESSIONS_KEPT = 2000;

/** The most of the file one read takes, from its end; the app's tail read is bounded the same way. */
const RECORD_READ_MAX_BYTES = 1024 * 1024;

const ID_PATTERN = /^[A-Za-z0-9._-]{1,80}$/;
const COMMIT_PATTERN = /^[0-9a-f]{7,64}$/i;
const AGENT_MAX_CHARS = 120;

function isCount(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function readTime(value) {
  if (typeof value !== 'string') return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function readPair(value, totalKey, partKey) {
  if (!value || typeof value !== 'object') return null;
  const total = value[totalKey];
  const part = value[partKey];
  return isCount(total) && isCount(part) && part <= total ? { [totalKey]: total, [partKey]: part } : null;
}

/**
 * One line as both readers take it, or null when it is not a version 1 line: an
 * id, a session, a positive number and a time are required; every other field
 * falls back (`origin` to `session`, a count to 0, the rest to null).
 */
function parseMapAnalysisLine(text) {
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
  if (!Number.isSafeInteger(number) || number < 1) return null;
  const atMs = readTime(raw.at);
  if (atMs === null) return null;
  const startedAtMs = readTime(raw.startedAt) ?? atMs;
  const concepts = raw.concepts && typeof raw.concepts === 'object' ? raw.concepts : {};
  const agent = typeof raw.agent === 'string' && raw.agent.trim() ? raw.agent.trim().slice(0, AGENT_MAX_CHARS) : null;
  return {
    analysis,
    session,
    number,
    origin: raw.origin === 'press' ? 'press' : 'session',
    startedAt: new Date(Math.min(startedAtMs, atMs)).toISOString(),
    at: new Date(atMs).toISOString(),
    agent,
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
export function readMapAnalyses(text) {
  const latestBySession = new Map();
  const order = [];
  let broken = 0;
  let firstNumber = null;
  for (const rawLine of String(text ?? '').split('\n')) {
    if (!rawLine.trim()) continue;
    const line = parseMapAnalysisLine(rawLine);
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
 * Every session's last line, sessions in the order they first appear, the newest
 * `RECORD_SESSIONS_KEPT`; null when a line does not parse, so a file this
 * version does not understand is never rewritten. O(lines).
 */
function foldMapAnalysisLines(text) {
  const latest = new Map();
  for (const rawLine of String(text ?? '').split('\n')) {
    if (!rawLine.trim()) continue;
    const line = parseMapAnalysisLine(rawLine);
    if (!line) return null;
    // Setting an existing key keeps its first place, so analyses keep their order.
    latest.set(`${line.analysis}\0${line.session}`, rawLine.trim());
  }
  return [...latest.values()].slice(-RECORD_SESSIONS_KEPT);
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

const SIDECAR_IO = {
  readTail: (vaultRoot) => readVaultSidecarTail(vaultRoot, MAP_ANALYSIS_FILENAME, RECORD_READ_MAX_BYTES),
  append: (vaultRoot, line) => appendVaultSidecarLine(vaultRoot, MAP_ANALYSIS_FILENAME, line),
  replace: (vaultRoot, text, expectedRevision) => replaceVaultSidecarText(vaultRoot, MAP_ANALYSIS_FILENAME, text, { expectedRevision }),
};

/**
 * One server process's writer. The file is read only when an analysis begins
 * (the session's first write, or its first after `ANALYSIS_GAP_MS`), which also
 * folds earlier sessions to their last line in one atomic replace; every other
 * write is one appended line. `pressAnalysisId` is the id the app gives every
 * request of one press; without it each session is its own analysis.
 */
export function createMapAnalysisRecorder({
  vaultRoot,
  pressAnalysisId = null,
  sessionId = randomUUID(),
  now = () => Date.now(),
  newId = randomUUID,
  io = SIDECAR_IO,
}) {
  const press = typeof pressAnalysisId === 'string' && ID_PATTERN.test(pressAnalysisId) ? pressAnalysisId : null;
  let current = null;

  function begin(atMs) {
    let stored = null;
    try {
      stored = io.readTail(vaultRoot);
    } catch {
      stored = null;
    }
    const { analyses } = readMapAnalyses(stored?.text ?? '');
    const pressed = press ? analyses.find((analysis) => analysis.id === press) : undefined;
    const number = pressed?.number ?? (analyses.at(-1)?.number ?? 0) + 1;
    const folded = stored && !stored.truncated ? foldMapAnalysisLines(stored.text) : null;
    current = {
      id: press ?? newId(),
      number,
      startedAtMs: atMs,
      lastAtMs: atMs,
      concepts: emptyConcepts(),
    };
    return folded && stored ? { lines: folded, revision: stored.revision } : null;
  }

  /**
   * Records one write; `measure` is called only when the write changed a concept.
   * Returns whether a line was written. Never throws.
   */
  function record({ effect, agent = null, measure }) {
    try {
      if (effectIsEmpty(effect)) return false;
      const atMs = now();
      const startsAnalysis = current === null || (press === null && atMs - current.lastAtMs > ANALYSIS_GAP_MS);
      const fold = startsAnalysis ? begin(atMs) : null;
      applyEffect(current.concepts, effect);
      current.lastAtMs = Math.max(current.lastAtMs, atMs);
      const counts = measure();
      const line = JSON.stringify({
        v: 1,
        analysis: current.id,
        number: current.number,
        session: sessionId,
        origin: press ? 'press' : 'session',
        startedAt: new Date(current.startedAtMs).toISOString(),
        at: new Date(atMs).toISOString(),
        agent: typeof agent === 'string' && agent.trim() ? agent.trim().slice(0, AGENT_MAX_CHARS) : null,
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
          return true;
        } catch {
          // Another session changed the file since it was read: append instead.
        }
      }
      io.append(vaultRoot, line);
      return true;
    } catch {
      return false;
    }
  }

  return { record, sessionId };
}
