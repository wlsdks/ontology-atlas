// Synchronous fs throughout `vault/`: MCP tool calls are infrequent, so async buys nothing.

import { AsyncLocalStorage } from 'node:async_hooks';
import { closeSync, fstatSync, openSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseFrontmatter } from '../parser.mjs';

import { pathToSlug, walkMd } from './slug-paths.mjs';

function sameFileSnapshot(left, right) {
  return left.dev === right.dev
    && left.ino === right.ino
    && left.size === right.size
    && left.mtimeMs === right.mtimeMs
    && left.ctimeMs === right.ctimeMs;
}

/** Reads bytes and metadata together from one open file, and confirms the current path is still that file. */
function readStableFileSnapshot(filePath) {
  let lastError = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    let descriptor = null;
    try {
      descriptor = openSync(filePath, 'r');
      const before = fstatSync(descriptor);
      const raw = readFileSync(descriptor, 'utf-8');
      const after = fstatSync(descriptor);
      closeSync(descriptor);
      descriptor = null;
      const currentPath = statSync(filePath);
      if (sameFileSnapshot(before, after) && sameFileSnapshot(after, currentPath)) {
        return { raw, stats: after };
      }
    } catch (error) {
      lastError = error;
    } finally {
      if (descriptor !== null) {
        try {
          closeSync(descriptor);
        } catch {
          /* already closed */
        }
      }
    }
  }
  const reason = lastError?.message ? ` (${lastError.message})` : '';
  const error = new Error(`Could not capture a stable file snapshot: ${filePath}${reason}`);
  if (lastError?.code) error.code = lastError.code;
  throw error;
}

/**
 * The first prose paragraph, so get_concept previews a sentence a person wrote
 * rather than table or code syntax; falls back to the raw body when no prose exists.
 */
export function extractSummaryExcerpt(body, maxLen = 800) {
  if (typeof body !== 'string' || body.length === 0) return '';
  const lines = body.split('\n');
  const isBlockStart = (line) => {
    const trimmed = line.trim();
    if (trimmed === '') return false;
    if (trimmed.startsWith('```')) return true;
    if (trimmed.startsWith('|')) return true;
    if (trimmed.startsWith('#')) return true;
    if (trimmed.startsWith('![')) return true;
    if (/^([-*_])(?:\s*\1){2,}$/.test(trimmed)) return true; // thematic break
    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) return true;
    if (/^\d+[.)]\s+/.test(trimmed)) return true; // ordered list
    if (trimmed.startsWith('> ')) return true;
    return false;
  };
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();
    if (trimmed === '' || isBlockStart(line)) {
      if (trimmed.startsWith('```')) {
        i += 1;
        while (i < lines.length && !lines[i].trim().startsWith('```')) i += 1;
      }
      i += 1;
      continue;
    }
    const para = [];
    while (i < lines.length) {
      const cur = lines[i];
      if (cur.trim() === '' || isBlockStart(cur)) break;
      para.push(cur.trim());
      i += 1;
    }
    if (para.length > 0) {
      const text = para.join(' ');
      return text.length > maxLen ? text.slice(0, maxLen).trimEnd() + '…' : text;
    }
  }
  const trimmedBody = body.trim();
  return trimmedBody.length > maxLen
    ? trimmedBody.slice(0, maxLen).trimEnd() + '…'
    : trimmedBody;
}

/**
 * Cap for `body: 'full'`: a vault `.md` can be a pasted log of hundreds of KB,
 * and one document must not fill an agent's context. Measured bodies run 1–3 KB;
 * anything cut is reported by {@link describeBodyDelivery}.
 */
export const FULL_BODY_MAX_CHARS = 40_000;

/**
 * Row cap for one `get_concepts({ body: "full" })`, narrower than the batch cap
 * of 50. Builders of runnable read workflows (meaning repair) must use this
 * value, or they emit a call the server rejects.
 */
export const GET_CONCEPTS_FULL_BODY_MAX = 20;

/**
 * Reports how much body was returned and what was withheld: the construction
 * rules put evidence and boundaries in the body, so a silent cut hides what an
 * agent must read. Only a cut response carries a `hint` naming the follow-up call.
 */
export function describeBodyDelivery(body, options = {}) {
  const { mode = 'excerpt', maxLen = 800, hint } = options;
  const source = typeof body === 'string' ? body : '';
  const totalChars = source.length;
  let text;
  if (mode === 'full') {
    text =
      totalChars > FULL_BODY_MAX_CHARS
        ? source.slice(0, FULL_BODY_MAX_CHARS)
        : source;
  } else {
    text = extractSummaryExcerpt(source, maxLen);
  }
  // An excerpt joins lines with spaces, so compare with whitespace normalised: a
  // one-paragraph body delivered whole must not read as truncated.
  const returnedChars = text.length;
  const flatten = (value) => value.replace(/\s+/g, ' ').trim();
  const truncated =
    mode === 'full'
      ? totalChars > FULL_BODY_MAX_CHARS
      : flatten(text) !== flatten(source);
  const info = { mode, totalChars, returnedChars, truncated };
  if (truncated) {
    info.omittedChars = Math.max(0, totalChars - returnedChars);
    if (hint) info.hint = hint;
  }
  return { text, info };
}

function docFromSnapshot(rootPath, filePath, snapshot) {
  const { frontmatter, body, diagnostics } = parseFrontmatter(snapshot.raw);
  const result = {
    slug: pathToSlug(rootPath, filePath),
    frontmatter,
    body,
    raw: snapshot.raw,
    mtime: snapshot.stats.mtimeMs,
  };
  if (diagnostics?.length) result.diagnostics = diagnostics;
  return result;
}

/**
 * Reads one `.md` from disk, never from the cache; its `mtime` passed as a later
 * `expectedMtime` enables conflict detection. Write paths use this, so a cached
 * parse can never stand in for the file a write is about to replace.
 */
export function readDoc(rootPath, filePath) {
  return docFromSnapshot(rootPath, filePath, readStableFileSnapshot(filePath));
}

/**
 * A file whose mtime or ctime falls within this many ms of the moment it was read
 * can still change without moving its stamp: two same-size writes inside one
 * timestamp tick, or a 2-second FAT/exFAT clock. Such an entry is trusted only after
 * its bytes are compared again; the same rule the app's vault index uses (Git's
 * "racily clean" entries).
 */
export const RACY_WINDOW_MS = 2000;

/** One server serves one vault; a second slot covers a test or tool that alternates. */
const MAX_CACHED_VAULTS = 2;

function stampOf(stats) {
  return {
    dev: stats.dev,
    ino: stats.ino,
    size: stats.size,
    mtimeMs: stats.mtimeMs,
    ctimeMs: stats.ctimeMs,
  };
}

function statOrNull(filePath) {
  return statSync(filePath, { throwIfNoEntry: false }) ?? null;
}

/**
 * Cached documents are shared by every caller until their file changes, so a caller
 * that edits one in place would corrupt the next call's graph. Frozen, such an edit
 * throws where it happens instead. Write paths copy (`{ ...doc.frontmatter }`) first.
 */
function deepFreeze(value) {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const key of Object.keys(value)) deepFreeze(value[key]);
  return value;
}

const docSetVersions = new WeakMap();

/**
 * The stamp-set version of an array returned by {@link loadVaultDocs}: equal
 * versions mean every file's path, size, mtime and ctime were equal (and racy files'
 * bytes compared equal), so anything computed from one array holds for the other.
 * `undefined` for an array the cache did not produce.
 */
export function vaultDocsVersion(docs) {
  return docs && typeof docs === 'object' ? docSetVersions.get(docs) : undefined;
}

let nextCacheId = 1;

/**
 * Per-file parse cache for one vault, inside this process.
 *
 * Every `load()` walks the folder and stats each file once (one stamp pass); only a
 * file whose stamp moved, or whose stamp is racy, is read and parsed again. Nothing
 * is trusted across processes or from a watcher: an editor, Git or the app changing a
 * file between two calls moves its stamp, and the next pass sees it.
 *
 * Data structure: a `Map` from absolute path to `{ stamp, readAt, doc, pass }`.
 * Cost per call: O(F) readdir and stat for F files, plus O(bytes of changed or racy
 * files) to read and parse; deleted files are swept in O(F) only when the count says
 * some entry was not visited. Memory: one parsed copy of the vault, replacing the
 * fresh copy each call used to allocate.
 *
 * @param {string} rootPath
 * @param {{ walk?: (root: string) => string[], stat?: (path: string) => import('node:fs').Stats | null, readSnapshot?: (path: string) => { raw: string, stats: import('node:fs').Stats }, now?: () => number }} [io]
 *   Injection points for tests that must fake a stamp the filesystem cannot produce on demand.
 */
export function createVaultDocCache(rootPath, io = {}) {
  const walk = io.walk ?? walkMd;
  const stat = io.stat ?? statOrNull;
  const readSnapshot = io.readSnapshot ?? readStableFileSnapshot;
  const now = io.now ?? Date.now;
  const cacheId = nextCacheId;
  nextCacheId += 1;
  /** @type {Map<string, { stamp: ReturnType<typeof stampOf>, readAt: number, doc: object, pass: number }>} */
  const entries = new Map();
  let generation = 0;
  let pass = 0;
  let reads = 0;

  function isRacy(entry) {
    return Math.max(entry.stamp.mtimeMs, entry.stamp.ctimeMs) > entry.readAt - RACY_WINDOW_MS;
  }

  function readEntry(filePath) {
    const readAt = now();
    let snapshot;
    try {
      snapshot = readSnapshot(filePath);
    } catch (error) {
      // Deleted between the walk and the read: it is simply not in this pass.
      if (error?.code === 'ENOENT') return null;
      throw error;
    }
    reads += 1;
    return { stamp: stampOf(snapshot.stats), readAt, snapshot };
  }

  function load() {
    pass += 1;
    const files = walk(rootPath);
    const docs = [];
    let visited = 0;
    for (const filePath of files) {
      const current = stat(filePath);
      if (!current || !current.isFile()) continue;
      const entry = entries.get(filePath);
      if (entry && sameFileSnapshot(entry.stamp, current)) {
        if (!isRacy(entry)) {
          entry.pass = pass;
          visited += 1;
          docs.push(entry.doc);
          continue;
        }
        const fresh = readEntry(filePath);
        if (!fresh) continue;
        if (fresh.snapshot.raw === entry.doc.raw && sameFileSnapshot(fresh.stamp, entry.stamp)) {
          // Equal bytes: keep the parsed doc and restart the racy clock from this read.
          entry.readAt = fresh.readAt;
          entry.pass = pass;
          visited += 1;
          docs.push(entry.doc);
          continue;
        }
        docs.push(store(filePath, fresh));
        visited += 1;
        continue;
      }
      const fresh = readEntry(filePath);
      if (!fresh) continue;
      docs.push(store(filePath, fresh));
      visited += 1;
    }
    if (visited !== entries.size) {
      for (const [filePath, entry] of entries) {
        if (entry.pass !== pass) entries.delete(filePath);
      }
      generation += 1;
    }
    docSetVersions.set(docs, `${cacheId}:${generation}`);
    return docs;
  }

  // The version moves with each stored entry, not at the end of a pass: a pass that
  // throws halfway must not leave replaced entries under the old version.
  function store(filePath, fresh) {
    const doc = deepFreeze(docFromSnapshot(rootPath, filePath, fresh.snapshot));
    entries.set(filePath, { stamp: fresh.stamp, readAt: fresh.readAt, doc, pass });
    generation += 1;
    return doc;
  }

  function stats() {
    return { files: entries.size, generation, passes: pass, reads };
  }

  return { load, stats };
}

/** Insertion order is recency: a hit is re-inserted, the oldest root is evicted. */
const vaultCaches = new Map();

function vaultCacheFor(rootPath) {
  const key = resolve(rootPath);
  let cache = vaultCaches.get(key);
  if (cache) {
    vaultCaches.delete(key);
  } else {
    cache = createVaultDocCache(key);
  }
  vaultCaches.set(key, cache);
  while (vaultCaches.size > MAX_CACHED_VAULTS) {
    vaultCaches.delete(vaultCaches.keys().next().value);
  }
  return cache;
}

const readSnapshotScope = new AsyncLocalStorage();

/**
 * Runs `fn` so every {@link loadVaultDocs} inside it, across its awaits, shares one
 * stamp pass per vault: one consistent snapshot per call instead of one pass per
 * helper. Only for calls that never write the vault: a write inside the scope would
 * not be seen by a later load in the same call. The scope is bound to `fn`'s own
 * async context, so a concurrent call (a write) is unaffected, and it closes when
 * `fn` settles, so work `fn` leaves scheduled reads the disk again.
 */
export async function withVaultReadSnapshot(fn) {
  const scope = { open: true, docsByRoot: new Map() };
  try {
    return await readSnapshotScope.run(scope, fn);
  } finally {
    scope.open = false;
  }
}

function copyWithVersion(docs) {
  const copy = docs.slice();
  docSetVersions.set(copy, docSetVersions.get(docs));
  return copy;
}

/**
 * Every doc in the vault, in walk order; the caller filters. Each call runs one stamp
 * pass and re-reads only files that changed (see {@link createVaultDocCache}), or,
 * inside {@link withVaultReadSnapshot}, reuses that call's pass. The array is new per
 * call; the docs in it are shared and frozen. A write must still read its target
 * with {@link readDoc}.
 */
export function loadVaultDocs(rootPath) {
  const scope = readSnapshotScope.getStore();
  if (!scope?.open) return vaultCacheFor(rootPath).load();
  const key = resolve(rootPath);
  let docs = scope.docsByRoot.get(key);
  if (!docs) {
    docs = vaultCacheFor(rootPath).load();
    scope.docsByRoot.set(key, docs);
  }
  return copyWithVersion(docs);
}

export function docTitle(doc) {
  if (typeof doc?.frontmatter?.title === 'string' && doc.frontmatter.title.trim()) {
    return doc.frontmatter.title;
  }
  if (typeof doc?.frontmatter?.name === 'string' && doc.frontmatter.name.trim()) {
    return doc.frontmatter.name;
  }
  return doc?.slug;
}
