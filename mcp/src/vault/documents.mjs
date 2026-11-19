// Synchronous fs throughout `vault/`: MCP tool calls are infrequent, so async buys nothing.

import { AsyncLocalStorage } from 'node:async_hooks';
import { closeSync, fstatSync, openSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { detachText, parseFrontmatter } from '../parser.mjs';

import { contentHash, textHash } from './content-hash.mjs';
import { bodyLinkKeys, bodyStartOf, evidenceSignature, rawShapeOf } from './doc-shape.mjs';
import { pathToSlug, walkMd } from './slug-paths.mjs';

function sameFileSnapshot(left, right) {
  return left.dev === right.dev
    && left.ino === right.ino
    && left.size === right.size
    && left.mtimeMs === right.mtimeMs
    && left.ctimeMs === right.ctimeMs;
}

/** Reads bytes and metadata together from one open file, and confirms the current path is still that file. */
/**
 * A cached document's bytes read back for its body: one read, no stamps. The hash
 * the caller compares proves them the bytes the parse came from, so a read torn by a
 * concurrent write fails that comparison instead of passing as the file.
 */
function readBack(filePath) {
  const bytes = readFileSync(filePath);
  return { raw: bytes.toString('utf8'), hash: contentHash(bytes) };
}

function readStableFileSnapshot(filePath) {
  let lastError = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    let descriptor = null;
    try {
      descriptor = openSync(filePath, 'r');
      const before = fstatSync(descriptor);
      const bytes = readFileSync(descriptor);
      const after = fstatSync(descriptor);
      closeSync(descriptor);
      descriptor = null;
      const currentPath = statSync(filePath);
      if (sameFileSnapshot(before, after) && sameFileSnapshot(after, currentPath)) {
        return { raw: bytes.toString('utf8'), stats: after, hash: contentHash(bytes) };
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
/** @typedef {ReturnType<typeof docFromSnapshot>} VaultDoc */

export function readDoc(rootPath, filePath) {
  const snapshot = readStableFileSnapshot(filePath);
  const doc = docFromSnapshot(rootPath, filePath, snapshot);
  forgetCachedFile(filePath, { hash: snapshot.hash }, snapshot.stats);
  return doc;
}

/**
 * Raised when a cached document's text is read again and the file no longer holds
 * the bytes its parse came from. The cache entry is dropped first, so the next
 * call parses the file as it is. A write treats it as any other conflict.
 */
export class VaultDocChangedError extends Error {
  constructor(slug, expectedMtime, currentMtime) {
    super(
      `Vault conflict: "${slug}" changed on disk while this call was reading it, so its cached parse no longer matches the file. ` +
        `expectedMtime=${expectedMtime} currentMtime=${currentMtime}. ` +
        'Call again to read it as it is now.',
    );
    this.name = 'VaultDocChangedError';
    this.code = 'VAULT_CONFLICT';
    this.slug = slug;
    this.expectedMtime = expectedMtime;
    this.currentMtime = currentMtime;
  }
}

/**
 * Bodies read back for cached documents, most recent last, held up to a byte
 * budget so a repeated search does not reopen the same files. Measured at 50,000
 * files: one find_evidence call reads well under this; a call that needs every
 * body reads the rest from disk without growing the cache.
 */
export const BODY_CACHE_MAX_BYTES = 32 * 1024 * 1024;

/**
 * Text one load pass hands out with the documents it read, so the call that made
 * the pass does not open those files again; past this, a body is read on demand.
 * Bounds a cold 50,000-file pass to this much text instead of the whole vault.
 */
export const PASS_TEXT_MAX_BYTES = 8 * 1024 * 1024;

/** Bytes a text costs at most: two per UTF-16 code unit. */
function textBytes(text) {
  return text.raw.length * 2;
}

/** Keyed by a file version's source (see `CachedVaultDoc`), shared by every document of that version. */
const recentTexts = new Map();
let recentTextBytes = 0;

function rememberText(source, text) {
  const bytes = textBytes(text);
  if (bytes > BODY_CACHE_MAX_BYTES) return;
  const previous = recentTexts.get(source);
  if (previous) {
    recentTextBytes -= textBytes(previous);
    recentTexts.delete(source);
  }
  recentTexts.set(source, text);
  recentTextBytes += bytes;
  for (const [oldest, oldText] of recentTexts) {
    if (recentTextBytes <= BODY_CACHE_MAX_BYTES) break;
    recentTexts.delete(oldest);
    recentTextBytes -= textBytes(oldText);
  }
}

function recalledText(source) {
  const text = recentTexts.get(source);
  if (!text) return undefined;
  recentTexts.delete(source);
  recentTexts.set(source, text);
  return text;
}

/** For tests: what the body cache holds now. */
export function bodyCacheStats() {
  return { entries: recentTexts.size, bytes: recentTextBytes, maxBytes: BODY_CACHE_MAX_BYTES };
}

/**
 * One parsed file as the cache holds it: its slug, a frontmatter copied out of the
 * file text (so no slice keeps the text alive), its mtime, and what was computed
 * from the text while it was in hand (`doc-shape.mjs`). `body` and `raw` are read
 * from the file again on demand and must hash to the bytes this parse came from;
 * recent ones are kept up to {@link BODY_CACHE_MAX_BYTES}, so a call that reads a
 * body twice opens its file once. A load pass may hand out a twin that carries the
 * text it just read; the twin shares the source, so what is memoized per file
 * version (`doc-facts.mjs`) is shared too.
 */
class CachedVaultDoc {
  #source;
  #text;

  constructor(source, slug, frontmatter, mtime, diagnostics, text = null) {
    this.#source = source;
    this.#text = text;
    this.slug = slug;
    this.frontmatter = frontmatter;
    this.mtime = mtime;
    if (diagnostics?.length) this.diagnostics = diagnostics;
  }

  get body() {
    return (this.#text ?? cachedDocText(this, this.#source)).body;
  }

  get raw() {
    return (this.#text ?? cachedDocText(this, this.#source)).raw;
  }

  withText(text) {
    return Object.freeze(new CachedVaultDoc(this.#source, this.slug, this.frontmatter, this.mtime, this.diagnostics, text));
  }

  static sourceOf(doc) {
    return doc !== null && typeof doc === 'object' && #source in doc ? doc.#source : null;
  }

  static textOf(doc) {
    return doc.#text;
  }
}

function cachedDocText(doc, source) {
  let text = recalledText(source);
  if (text) return text;
  let snapshot = null;
  try {
    snapshot = source.read();
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  if (!snapshot || (snapshot.hash ?? textHash(snapshot.raw)) !== source.hash) {
    source.forget();
    throw new VaultDocChangedError(doc.slug, doc.mtime, snapshot?.stats?.mtimeMs ?? null);
  }
  noteTextRead(snapshot.raw.length);
  const { raw } = snapshot;
  text = { raw, body: source.bodyStart >= 0 ? raw.slice(source.bodyStart) : parseFrontmatter(raw).body };
  rememberText(source, text);
  return text;
}

/**
 * A document's `{ raw, body }`: a cached document's text as `body` and `raw` read
 * it, a plain one (a fresh read, a test fixture) from its own fields.
 */
export function readVaultDocText(doc) {
  const source = CachedVaultDoc.sourceOf(doc);
  if (!source) return { raw: doc?.raw ?? '', body: doc?.body ?? '' };
  return CachedVaultDoc.textOf(doc) ?? cachedDocText(doc, source);
}

/**
 * The object every document of one file version shares, or null for a document
 * the cache did not produce: what per-version answers are keyed by.
 */
export function cachedDocVersionKey(doc) {
  return CachedVaultDoc.sourceOf(doc);
}

/**
 * What the cache computed from a document's text at load (`rawShape`, `bodyStart`,
 * `links`, `evidence`; see `doc-shape.mjs`), or null for a document it did not
 * produce.
 */
export function cachedDocShape(doc) {
  return CachedVaultDoc.sourceOf(doc);
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

function expectedHash(expected) {
  return typeof expected === 'string' ? textHash(expected) : expected?.hash;
}

function statOrNull(filePath) {
  return statSync(filePath, { throwIfNoEntry: false }) ?? null;
}

/**
 * Whether arrays are frozen with the objects that hold them. V8 freezes an array in
 * place; JavaScriptCore (bun, the shipped server) moves each frozen array into a
 * sparse map, measured at 8 MB for the 47,700 frontmatter arrays of a 50,000-file
 * vault. The guard below exists to catch a caller that edits a shared array, and the
 * test suite runs under Node, so under bun arrays stay unfrozen and objects frozen.
 */
const FREEZE_ARRAYS = !globalThis.Bun;

/**
 * Cached documents are shared by every caller until their file changes, so a caller
 * that edits one in place would corrupt the next call's graph. Frozen, such an edit
 * throws where it happens instead. Write paths copy (`{ ...doc.frontmatter }`) first.
 */
function deepFreeze(value) {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value;
  if (Array.isArray(value) && !FREEZE_ARRAYS) {
    for (const item of value) deepFreeze(item);
    return value;
  }
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
 * Frontmatter strings this short are shared within one load pass: kinds, domains,
 * relation targets and tags repeat across thousands of files, and one copy each
 * measured 8 MB of heap and 23 MB of footprint less at 50,000 files.
 */
const SHARED_TEXT_MAX_CHARS = 64;

/** A copy of `text` that shares no memory with its file, shared with an equal short copy made earlier in this pass. */
function sharedText(text, shared) {
  if (text.length > SHARED_TEXT_MAX_CHARS) return detachText(text);
  const held = shared.get(text);
  if (held !== undefined) return held;
  const copy = detachText(text);
  shared.set(copy, copy);
  return copy;
}

/** `detachText(value)`, sharing short strings through `shared`. */
function copyFrontmatter(value, shared) {
  if (typeof value === 'string') return sharedText(value, shared);
  if (Array.isArray(value)) return value.map((item) => copyFrontmatter(item, shared));
  if (value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, copyFrontmatter(item, shared)]));
  }
  return value;
}

/**
 * A pass's text is garbage as soon as each file is parsed, but bun's collector, left
 * to itself, lets a 50,000-file pass's worth pile up and keeps the allocator's pages
 * under it for many calls. So, under bun only (Node exposes no collector):
 * - every {@link COLLECT_EVERY_CHARS} characters read, the reader asks for a
 *   collection that runs alongside it (`Bun.gc(false)`); a full, synchronous one
 *   there measured no lower;
 * - every {@link COLLECT_AFTER_CHARS} characters read, a full collection runs once
 *   the call's synchronous work is done.
 * Measured on the compiled server at 50,000 files over the perf gate's 20 calls:
 * footprint after them 146 MB (flow a) and 85 MB (flow b) against 201 and 95 MB
 * with neither, peaks 397 and 204 MB against 427 and 247 MB; without the second,
 * 154 and 144 MB, peaks 499 and 213 MB.
 */
const COLLECT_EVERY_CHARS = 4 * 1024 * 1024;
const COLLECT_AFTER_CHARS = 16 * 1024 * 1024;
let collectionScheduled = false;

let charsSinceStep = 0;
let charsSinceFull = 0;

/** Counts text read from vault files, by a load pass or a body read back, and collects as above. */
function noteTextRead(chars) {
  if (!globalThis.Bun) return;
  charsSinceStep += chars;
  charsSinceFull += chars;
  if (charsSinceStep >= COLLECT_EVERY_CHARS) {
    charsSinceStep = 0;
    globalThis.Bun.gc(false);
  }
  if (charsSinceFull >= COLLECT_AFTER_CHARS && !collectionScheduled) {
    charsSinceFull = 0;
    collectionScheduled = true;
    setTimeout(() => {
      collectionScheduled = false;
      globalThis.Bun.gc(true);
    }, 0).unref?.();
  }
}

/**
 * One file version in the cache: its stamp (device, inode, size, mtime, ctime), when
 * it was read, the SHA-1 of its bytes, what was computed from its text, and its
 * document. Also the key every per-version answer is kept under (`doc-facts.mjs`).
 * One object per file: the cache's bookkeeping is a measured part of what a
 * 50,000-file vault holds.
 */
class CacheEntry {
  constructor(io, path, stats, readAt, hash, facts) {
    this.io = io;
    this.path = path;
    this.dev = stats.dev;
    this.ino = stats.ino;
    this.size = stats.size;
    this.mtimeMs = stats.mtimeMs;
    this.ctimeMs = stats.ctimeMs;
    this.readAt = readAt;
    this.hash = hash;
    this.rawShape = facts.rawShape;
    this.bodyStart = facts.bodyStart;
    this.links = facts.links;
    this.evidence = facts.evidence;
    this.pass = 0;
    this.doc = null;
  }

  setStamp(stats) {
    this.dev = stats.dev;
    this.ino = stats.ino;
    this.size = stats.size;
    this.mtimeMs = stats.mtimeMs;
    this.ctimeMs = stats.ctimeMs;
  }

  read() {
    return this.io.readSnapshot(this.path);
  }

  forget() {
    this.io.forget(this.path);
  }
}

/**
 * Per-file parse cache for one vault, inside this process.
 *
 * `load()` walks the folder and stats each file once (one stamp pass); only a file
 * whose stamp moved, or whose stamp is racy, is read and parsed again. Nothing is
 * trusted across processes or from a watcher: an editor, Git or the app changing a
 * file between two calls moves its stamp, and the next pass sees it.
 * `load({ fresh: true })` reads every file and compares bytes instead, trusting no
 * stamp; unchanged files keep their parsed doc, so it refreshes the cache too.
 *
 * Data structure: a `Map` from absolute path to its {@link CacheEntry}, and a `Map`
 * from device to a `Map` from inode to that path, so a fresh read under another
 * spelling finds its entry in O(1).
 * Cost per stamp pass: O(F) readdir and stat for F files, plus O(bytes of changed or
 * racy files) to read and parse; a fresh pass is O(bytes of the vault). Deleted files
 * are swept in O(F) only when the count says some entry was not visited. Memory: each
 * file's frontmatter copied out of its text, a SHA-1 of its bytes and what
 * `doc-shape.mjs` computes; no file text stays (see `CachedVaultDoc`).
 *
 * @param {string} rootPath
 * @param {{ walk?: (root: string) => string[], stat?: (path: string) => import('node:fs').Stats | null, readSnapshot?: (path: string) => { raw: string, stats: import('node:fs').Stats, hash?: string }, now?: () => number }} [io]
 *   Injection points for tests that must fake a stamp the filesystem cannot produce on demand.
 */
export function createVaultDocCache(rootPath, io = {}) {
  const walk = io.walk ?? walkMd;
  const stat = io.stat ?? statOrNull;
  const readSnapshot = io.readSnapshot ?? readStableFileSnapshot;
  const now = io.now ?? Date.now;
  const cacheId = nextCacheId;
  nextCacheId += 1;
  /** @type {Map<string, CacheEntry>} */
  const entries = new Map();
  /**
   * One file however its path is spelled: a slug resolves to NFC (composed Hangul) or
   * to the case the agent typed, while the walk returns the name as stored (NFD on
   * many macOS volumes, any case on a case-insensitive one).
   * @type {Map<number, Map<number, string>>} device → inode → path in `entries`
   */
  const pathByIdentity = new Map();
  const entryIo = { readSnapshot: io.readSnapshot ?? readBack, forget: (filePath) => forget(filePath) };
  let generation = 0;
  let pass = 0;
  let reads = 0;

  function isRacy(entry) {
    return Math.max(entry.mtimeMs, entry.ctimeMs) > entry.readAt - RACY_WINDOW_MS;
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
    noteTextRead(snapshot.raw.length);
    return { stats: snapshot.stats, readAt, snapshot, hash: snapshot.hash ?? textHash(snapshot.raw) };
  }

  /**
   * `keepTextBytes`: how much of the text this pass reads it hands out with the
   * documents (see {@link PASS_TEXT_MAX_BYTES}); the cache itself keeps none.
   * @param {{ fresh?: boolean, keepTextBytes?: number }} [options]
   * @returns {VaultDoc[]}
   */
  function load({ fresh: readEveryFile = false, keepTextBytes = 0 } = {}) {
    pass += 1;
    const files = walk(rootPath);
    /** @type {VaultDoc[]} */
    const docs = [];
    let visited = 0;
    let keptBytes = 0;
    /** Short frontmatter strings this pass copied, shared by every file that repeats one. */
    const shared = new Map();
    const handOut = (doc, raw, body) => {
      const bytes = raw.length * 2;
      if (keptBytes + bytes > keepTextBytes) return doc;
      keptBytes += bytes;
      return doc.withText({ raw, body: body ?? parseFrontmatter(raw).body });
    };
    for (const filePath of files) {
      if (readEveryFile) {
        const fresh = readEntry(filePath);
        if (!fresh) continue;
        const entry = entries.get(filePath);
        // Equal bytes alone are not enough: the doc carries `mtime`, which agents pass
        // back as `expected_mtime` and the graph reports as `maxMtime`.
        if (entry && entry.hash === fresh.hash && sameFileSnapshot(entry, fresh.stats)) {
          entry.readAt = fresh.readAt;
          entry.pass = pass;
          docs.push(handOut(entry.doc, fresh.snapshot.raw));
        } else {
          docs.push(store(filePath, fresh, handOut, shared));
        }
        visited += 1;
        continue;
      }
      const current = stat(filePath);
      if (!current || !current.isFile()) continue;
      const entry = entries.get(filePath);
      if (entry && sameFileSnapshot(entry, current)) {
        if (!isRacy(entry)) {
          entry.pass = pass;
          visited += 1;
          docs.push(entry.doc);
          continue;
        }
        const fresh = readEntry(filePath);
        if (!fresh) continue;
        if (fresh.hash === entry.hash && sameFileSnapshot(fresh.stats, entry)) {
          // Equal bytes: keep the parsed doc and restart the racy clock from this read.
          entry.readAt = fresh.readAt;
          entry.pass = pass;
          visited += 1;
          docs.push(entry.doc);
          continue;
        }
        docs.push(store(filePath, fresh, handOut, shared));
        visited += 1;
        continue;
      }
      const fresh = readEntry(filePath);
      if (!fresh) continue;
      docs.push(store(filePath, fresh, handOut, shared));
      visited += 1;
    }
    if (visited !== entries.size) {
      for (const [filePath, entry] of entries) {
        if (entry.pass !== pass) remove(filePath, entry);
      }
    }
    docSetVersions.set(docs, `${cacheId}:${generation}`);
    return docs;
  }

  // The version moves with every entry stored or removed, not at the end of a pass: a
  // pass that throws halfway must not leave replaced entries under the old version, and
  // a dropped entry whose file is then deleted is never seen again to move it.
  // Everything taken from the text is copied or computed here, while the text is in
  // hand, so the text itself can be let go.
  function store(filePath, fresh, handOut, shared) {
    const { raw } = fresh.snapshot;
    const { frontmatter, body, diagnostics } = parseFrontmatter(raw);
    const entry = new CacheEntry(entryIo, filePath, fresh.stats, fresh.readAt, fresh.hash, {
      rawShape: rawShapeOf(raw),
      bodyStart: bodyStartOf(raw, body),
      links: bodyLinkKeys(body),
      evidence: evidenceSignature(body.toLowerCase()),
    });
    entry.pass = pass;
    entry.doc = deepFreeze(new CachedVaultDoc(
      entry,
      sharedText(pathToSlug(rootPath, filePath), shared),
      copyFrontmatter(frontmatter, shared),
      fresh.stats.mtimeMs,
      diagnostics?.length ? detachText(diagnostics) : undefined,
    ));
    const previous = entries.get(filePath);
    if (previous) unindex(filePath, previous);
    index(filePath, entry);
    entries.set(filePath, entry);
    generation += 1;
    return handOut(entry.doc, raw, body);
  }

  function index(filePath, entry) {
    let byInode = pathByIdentity.get(entry.dev);
    if (!byInode) {
      byInode = new Map();
      pathByIdentity.set(entry.dev, byInode);
    }
    byInode.set(entry.ino, filePath);
  }

  function unindex(filePath, entry) {
    const byInode = pathByIdentity.get(entry.dev);
    if (byInode?.get(entry.ino) === filePath) byInode.delete(entry.ino);
  }

  function remove(filePath, entry) {
    entries.delete(filePath);
    generation += 1;
    unindex(filePath, entry);
  }

  /**
   * Drops the entry for `filePath` unless its bytes equal `expected`: the text a
   * fresh read found, or `{ hash }` of its bytes (any bytes when omitted). On a
   * filesystem whose stamp cannot show an edit (FAT/exFAT keep no ctime; a tool can
   * restore mtime), a write path's fresh read is the only witness, and without this
   * the stale parse would outlive every retry.
   * The entry is found by `filePath` as spelled, else by the file's device and inode
   * (from `stats`, or a stat of `filePath`).
   */
  function forget(filePath, expected, stats) {
    let key = entries.has(filePath) ? filePath : undefined;
    if (key === undefined) {
      const current = stats ?? stat(filePath);
      if (current) key = pathByIdentity.get(current.dev)?.get(current.ino);
    }
    const entry = key === undefined ? undefined : entries.get(key);
    if (!entry || (expected !== undefined && entry.hash === expectedHash(expected))) return false;
    remove(key, entry);
    return true;
  }

  function stats() {
    return { files: entries.size, generation, passes: pass, reads };
  }

  return { forget, load, stats };
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

/**
 * Tells every cached vault that a fresh read of `filePath` found `expected` (its
 * text, or `{ hash }` of its bytes; omitted, bytes other than a cached doc
 * expected), so a differing entry is read again on the next load.
 * O(number of cached vaults), at most two.
 */
export function forgetCachedFile(filePath, expected, stats) {
  const key = resolve(filePath);
  let forgotten = false;
  for (const cache of vaultCaches.values()) forgotten = cache.forget(key, expected, stats) || forgotten;
  return forgotten;
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
    // Work the call left scheduled may still hold the scope; the text it kept must
    // not outlive the call through it.
    scope.open = false;
    scope.docsByRoot.clear();
  }
}

function copyWithVersion(docs) {
  const copy = docs.slice();
  docSetVersions.set(copy, docSetVersions.get(docs));
  return copy;
}

/**
 * Every doc in the vault, in path order; the caller filters. Outside a read scope
 * every file is read and its bytes compared (see {@link createVaultDocCache}):
 * write tools decide whether to delete, rename or merge from what other files say,
 * and a stamp that cannot show an edit (FAT/exFAT keep no ctime) must not let a
 * stale parse make that decision. Inside {@link withVaultReadSnapshot}, which the
 * server opens only for read-only tools, the call runs one stamp pass and shares it.
 * The array is new per call; the docs in it are shared and frozen. A write must
 * still read its target with {@link readDoc}.
 * @returns {VaultDoc[]}
 */
export function loadVaultDocs(rootPath) {
  const scope = readSnapshotScope.getStore();
  if (!scope?.open) return vaultCacheFor(rootPath).load({ fresh: true, keepTextBytes: PASS_TEXT_MAX_BYTES });
  const key = resolve(rootPath);
  let docs = scope.docsByRoot.get(key);
  if (!docs) {
    docs = vaultCacheFor(rootPath).load({ keepTextBytes: PASS_TEXT_MAX_BYTES });
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
