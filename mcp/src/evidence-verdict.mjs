/**
 * Does one concept still stand on the code it cites? The screen and the MCP
 * server import this one rule so their four-word answers cannot
 * disagree. `.mjs` with a `.d.mts` so Node and the browser bundle load it without a build.
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
 * Judges one concept from its document's newest commit and the walk's result
 * per cited path. Fixed, total priority: a gone path beats a moved file, which
 * beats anything undated; a moved folder is never `stale`, since a folder
 * changes on almost any commit.
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
