/**
 * Does one concept still stand on the code it cites? The map screens ask this one rule, and
 * the Rust server answers the same four words (`tests/contract/analysis/evidence-drift-parity.contract.test.ts`
 * holds the screen to the recorded answers). `.mjs` with a `.d.mts` so Node and the browser bundle load it
 * without a build.
 */

import { comparableCode } from './comparable-code.mjs';
import { namesHiddenOrCredentialFile } from './credential-names.mjs';

/**
 * @param {string|null|undefined} value
 * @returns {number|null}
 */
function toMs(value) {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * How many pairs one read asks for. Every surface reads the same sorted list in chunks
 * of this size, so each judges every pair and the readers' byte budgets fall on the
 * same pairs.
 */
export const EVIDENCE_TEXT_CHUNK = 256;

/** One (document commit, cited file) pair, as a set key. */
function evidencePairKey(commit, path) {
  return `${commit}\0${path}`;
}

/**
 * Every pair the date rule calls moved, deduplicated and sorted by path then commit, so
 * the order does not depend on which concepts a surface walked first: the files to
 * re-read at the commit that dates the concept document. A document without a commit names no
 * pair, and a hidden or credential-named path is never asked for; both stay moved.
 *
 * @param {readonly {docPath: string|null, evidencePaths: readonly string[]}[]} concepts
 * @param {ReadonlyMap<string, {exists: boolean, isDir?: boolean, lastChangedAt: string|null, lastCommit?: string|null}>} changes
 * @param {ReadonlyMap<string, {exists: boolean, isDir?: boolean, lastChangedAt: string|null}>} [sourceChanges]
 * @returns {{commit: string, path: string}[]}
 */
export function movedEvidencePairs(concepts, changes, sourceChanges = changes) {
  const pairs = new Map();
  for (const concept of concepts) {
    const doc = concept.docPath ? changes.get(concept.docPath) : undefined;
    const commit = doc?.lastCommit;
    if (!commit) continue;
    const { moved } = judgeEvidence({
      docChangedAt: doc?.lastChangedAt ?? null,
      entries: concept.evidencePaths.map((path) => ({ path, change: sourceChanges.get(path) ?? null })),
    });
    for (const { path } of moved) {
      if (namesHiddenOrCredentialFile(path)) continue;
      pairs.set(evidencePairKey(commit, path), { commit, path });
    }
  }
  const byPathThenCommit = (a, b) => (a.path === b.path ? compare(a.commit, b.commit) : compare(a.path, b.path));
  return [...pairs.values()].sort(byPathThenCommit);
}

function compare(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * The pairs whose two readings differ only in comments, imports and whitespace. A reading that
 * is absent (unreadable, binary, too large) never counts as unchanged.
 *
 * @param {readonly {commit: string, path: string, before: string|null|undefined, after: string|null|undefined}[]} readings
 * @returns {Set<string>}
 */
export function unchangedEvidencePairs(readings) {
  const unchanged = new Set();
  for (const { commit, path, before, after } of readings ?? []) {
    if (typeof before !== 'string' || typeof after !== 'string' || !commit) continue;
    if (comparableCode(before, path) === comparableCode(after, path)) unchanged.add(evidencePairKey(commit, path));
  }
  return unchanged;
}

/**
 * Judges one concept from the commit that dates its document and the walk's result
 * per cited path. Fixed, total priority: a gone path beats a moved file, which
 * beats anything undated; a moved folder is never `stale`, since a folder
 * changes on almost any commit. A file the dates call moved is not moved when
 * `unchangedPairs` holds it at `docCommit`: only comments, imports or whitespace changed.
 *
 * @param {{ docChangedAt: string|null|undefined, docCommit?: string|null, unchangedPairs?: ReadonlySet<string>, entries: readonly {path: string, change: {exists: boolean, isDir?: boolean, lastChangedAt: string|null}|null|undefined}[] }} input
 * @returns {{ verdict: 'current'|'stale'|'missing'|'unknown', reason: string|null, moved: {path: string, changedAt: string}[], folders: {path: string, changedAt: string}[], gone: string[] }}
 */
export function judgeEvidence({ docChangedAt, docCommit = null, unchangedPairs = null, entries }) {
  const moved = [];
  const folders = [];
  const gone = [];
  if (!entries || entries.length === 0) {
    return { verdict: 'unknown', reason: 'no-evidence', moved, folders, gone };
  }
  const docMs = toMs(docChangedAt);
  let unwalked = false;
  let undated = false;
  for (const entry of entries) {
    const change = entry?.change;
    if (!change) {
      unwalked = true;
      continue;
    }
    if (!change.exists) {
      gone.push(entry.path);
      continue;
    }
    if (docMs == null || !change.lastChangedAt) {
      undated = true;
      continue;
    }
    const changeMs = toMs(change.lastChangedAt);
    if (changeMs != null && changeMs > docMs) {
      if (change.isDir) folders.push({ path: entry.path, changedAt: change.lastChangedAt });
      else if (!(docCommit && unchangedPairs?.has(evidencePairKey(docCommit, entry.path)))) {
        moved.push({ path: entry.path, changedAt: change.lastChangedAt });
      }
    }
  }
  if (gone.length > 0) return { verdict: 'missing', reason: null, moved, folders, gone };
  if (moved.length > 0) return { verdict: 'stale', reason: null, moved, folders, gone };
  if (unwalked) return { verdict: 'unknown', reason: 'path-not-walked', moved, folders, gone };
  if (undated) {
    return {
      verdict: 'unknown',
      reason: docMs == null ? 'document-time-unknown' : 'path-time-unknown',
      moved,
      folders,
      gone,
    };
  }
  if (folders.length > 0) return { verdict: 'unknown', reason: 'folder-only', moved, folders, gone };
  return { verdict: 'current', reason: null, moved, folders, gone };
}
