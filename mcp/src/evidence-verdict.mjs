/**
 * **Does one concept still stand on the code it cites?**
 *
 * The screen and the MCP server must answer this in the same four words, so the rule lives
 * here once and both import it. It was two implementations for a day, and they disagreed:
 * a concept citing both a path that is gone and a path the walk never reached came back
 * `missing` from one and `unknown` from the other (design-handoff, 2026-09-19). One rule
 * cannot drift from itself.
 *
 * This module is `.mjs` with a `.d.mts` beside it for the same reason `wiki-report.mjs` is:
 * the Node MCP server and the browser bundle both load it without a build step.
 */

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
 * Judge one concept from its document's newest commit and what the walk said about each
 * cited path. Priority is fixed and total: a path that is gone outranks a file that moved,
 * a file that moved outranks anything undated, and a folder that moved is never `stale` —
 * a folder changes on almost any commit, so it says "something under it moved".
 *
 * @param {{ docChangedAt: string|null|undefined, entries: readonly {path: string, change: {exists: boolean, isDir?: boolean, lastChangedAt: string|null}|null|undefined}[] }} input
 * @returns {{ verdict: 'current'|'stale'|'missing'|'unknown', reason: string|null, moved: {path: string, changedAt: string}[], folders: {path: string, changedAt: string}[], gone: string[] }}
 */
export function judgeEvidence({ docChangedAt, entries }) {
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
      (change.isDir ? folders : moved).push({ path: entry.path, changedAt: change.lastChangedAt });
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
