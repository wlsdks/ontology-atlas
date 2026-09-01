// Vault helpers — directory walking plus `.md` read/write. Synchronous fs only:
// MCP tool calls are infrequent, so async overhead buys nothing.

import {
  accessSync,
  closeSync,
  constants as fsConstants,
  fchmodSync,
  fstatSync,
  fsyncSync,
  openSync,
  readdirSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  realpathSync,
  renameSync,
  rmdirSync,
  statSync,
  unlinkSync,
} from 'node:fs';
import { join, relative, dirname, resolve, sep } from 'node:path';

import { parseFrontmatter, buildMarkdown } from './parser.mjs';
import {
  NODE_ELIGIBILITY_GATE,
  flatSlugIssue,
  generateNodeUid,
  inspectMergedUids,
  nodeUidIssue,
} from './schema.mjs';
import {
  bulkProvenanceMessage,
  capabilityWithoutEvidenceMessage,
  danglingGraphReferenceMessage,
  denseParentActionMessage,
  looksLikeEvidencePath,
  looksLikePath,
  pathShapedReferenceMessage,
  pathShapedTitleMessage,
} from './construction-rules.mjs';
import { hasCapabilityImplementationEvidence } from './capability-evidence.mjs';

/**
 * External-change detection — blocks a silent overwrite when a human GUI, an
 * outside editor, or another AI's MCP server touches the same `.md` concurrently.
 *
 * When the caller passes `expectedMtime`, the current mtime is compared just
 * before the write and a conflict throws, leaving the caller to tell the user and
 * decide whether to force. Omitting the option skips the check, which keeps
 * existing callers working.
 *
 * mtime is an integer in ms. Filesystems differ in precision, but MCP calls are
 * infrequent enough that 1s-granularity detection suffices.
 */
export class VaultConflictError extends Error {
  constructor(slug, expectedMtime, currentMtime) {
    super(
      `Vault conflict: "${slug}" was modified externally (changed on disk) between read and write. ` +
        `expectedMtime=${expectedMtime} currentMtime=${currentMtime}. ` +
        // **Never name a recovery path that does not exist** (measured 2026-07-29).
        //
        // The old wording said to overwrite with `force:true`. Of the eight write
        // tools that raise this error, **seven do not declare `force` at all** —
        // trying it yields `unknown_argument`. The one that does accept it,
        // `delete_concept`, means "delete even with backlinks", not "ignore
        // mtime", so it comes back as `vault_conflict` too.
        //
        // The advertised recovery was therefore dead in all eight tools, and an
        // agent that believes the message fails a second time. State only the
        // path that actually works.
        `Re-read the doc with get_concept to get the current expected_mtime, then retry the write.`,
    );
    this.name = 'VaultConflictError';
    this.code = 'VAULT_CONFLICT';
    this.slug = slug;
    this.expectedMtime = expectedMtime;
    this.currentMtime = currentMtime;
  }
}

/**
 * File mtime (ms), or null when the file is absent. In a read-modify-write flow
 * the caller captures it right after the read and passes it as `expectedMtime`.
 */
export function getFileMtime(filePath) {
  try {
    return statSync(filePath).mtimeMs;
  } catch {
    return null;
  }
}

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
        return { raw, mtime: after.mtimeMs };
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
  throw new Error(`Could not capture a stable file snapshot: ${filePath}${reason}`);
}

function assertSnapshotMtime(slug, expectedMtime, currentMtime) {
  if (expectedMtime === null || expectedMtime === undefined) return;
  if (currentMtime === null || Math.abs(currentMtime - expectedMtime) >= 1) {
    throw new VaultConflictError(slug, expectedMtime, currentMtime);
  }
}

function assertCurrentDocSnapshot(slug, filePath, expectedRaw, expectedMtime) {
  if (!fileMatchesExpectedRaw(filePath, expectedRaw)) {
    throw new VaultConflictError(slug, expectedMtime, getFileMtime(filePath));
  }
}

function assertPlainObject(value, name) {
  if (value === null || Array.isArray(value) || typeof value !== 'object') {
    throw new Error(`${name} must be an object.`);
  }
}

function assertOptionalPlainObject(value, name) {
  if (value === undefined) return;
  assertPlainObject(value, name);
}

function assertBoundedNonNegativeInteger(value, name, { max }) {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative integer.`);
  }
  if (value > max) {
    throw new Error(`${name} must be <= ${max}.`);
  }
}

/**
 * The frontmatter array keys that are *interpreted as graph edges*. Adding a new
 * edge type (`aggregates`, `implements`, …) here covers findOrphans, findPath,
 * and the rest automatically. Two functions used to hold their own local copy of
 * this array, which is exactly how they drifted.
 */
const NEIGHBOR_KEYS = Object.freeze([
  'domains',
  'capabilities',
  'elements',
  'dependencies',
  'relates',
  'contains',
  'describes',
  'broader',
]);

const INLINE_NEIGHBOR_KEYS = Object.freeze(['domain']);
export const NEIGHBOR_KEY_ALIASES = Object.freeze({
  depends_on: 'dependencies',
});
export const GRAPH_ARRAY_KEYS = Object.freeze([
  ...NEIGHBOR_KEYS,
  ...Object.keys(NEIGHBOR_KEY_ALIASES),
]);
const GRAPH_ARRAY_KEY_SET = new Set(GRAPH_ARRAY_KEYS);

/**
 * Graph relation arrays should be stable on disk. Agent writes can arrive in
 * different orders, but the same edge set should serialize the same way.
 */
export function normalizeRelationRefs(values) {
  if (!Array.isArray(values)) return [];
  const seen = new Set();
  const refs = [];
  const passthrough = [];
  for (const value of values) {
    if (typeof value !== 'string') {
      passthrough.push(value);
      continue;
    }
    const ref = value.trim();
    if (!ref || seen.has(ref)) continue;
    seen.add(ref);
    refs.push(ref);
  }
  refs.sort((a, b) => a.localeCompare(b, 'en'));
  return [...refs, ...passthrough];
}

function normalizeFrontmatterValue(key, value) {
  if (GRAPH_ARRAY_KEY_SET.has(key) && Array.isArray(value)) {
    return normalizeRelationRefs(value);
  }
  return value;
}

export function collectNeighborRefs(doc) {
  const refs = [];
  const seen = new Set();
  const pushRef = (key, ref) => {
    if (typeof ref !== 'string') return;
    const trimmed = ref.trim();
    if (!trimmed) return;
    const canonicalKey = NEIGHBOR_KEY_ALIASES[key] || key;
    const seenKey = `${canonicalKey}\0${trimmed}`;
    if (seen.has(seenKey)) return;
    seen.add(seenKey);
    refs.push({ key: canonicalKey, ref: trimmed });
  };
  for (const key of NEIGHBOR_KEYS) {
    const value = doc.frontmatter[key];
    if (!Array.isArray(value)) continue;
    for (const ref of value) {
      pushRef(key, ref);
    }
  }
  for (const key of Object.keys(NEIGHBOR_KEY_ALIASES)) {
    const value = doc.frontmatter[key];
    if (!Array.isArray(value)) continue;
    for (const ref of value) {
      pushRef(key, ref);
    }
  }
  for (const key of INLINE_NEIGHBOR_KEYS) {
    pushRef(key, doc.frontmatter[key]);
  }
  return refs;
}

/**
 * The one-sentence rationale a source document stores for one of its relations:
 * `relation_notes: { <target ref>: "why" }`, written by `add_relation(why)` in the
 * same frontmatter write as the edge. The map is keyed by the ref exactly as the
 * relation array spells it, so the raw ref is tried first and the resolved slug
 * second — the same lookup order the compiler uses for `edge.rationale`.
 *
 * Returns the trimmed sentence, or `undefined` when the document carries no
 * note for that target. Callers omit the key on `undefined` rather than sending
 * `null`: an absent rationale is an absent claim, not a claim with a null value.
 */
export function relationNoteFor(doc, ref, resolvedSlug) {
  const notes = doc?.frontmatter?.relation_notes;
  if (!notes || typeof notes !== 'object' || Array.isArray(notes)) return undefined;
  for (const key of [ref, resolvedSlug]) {
    if (typeof key !== 'string') continue;
    const value = Object.prototype.hasOwnProperty.call(notes, key) ? notes[key] : undefined;
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return undefined;
}

/**
 * Finds the documents that **name `ref` in a relation key**.
 *
 * Why it exists (measured 2026-07-26): the web map showed 289 concepts while the
 * compiled graph had 96 nodes. The 193 in between are *concepts with no document
 * of their own, named only in another document's relation keys*. Copying such a
 * name off the map into `get_concept` used to end in `Doc not found` — the vault
 * answering "unknown" about a name it **does know**, which makes the numbers on
 * screen untrustworthy.
 *
 * This function creates no nodes (the graph inventory stays 96). It returns only
 * the fact of "which document in this vault wrote this name, under which key",
 * and the caller turns that fact into an answer instead of an error.
 */
export function findGraphReferences(docs, ref) {
  const target = String(ref ?? '').trim();
  if (!target) return [];
  const hits = [];
  for (const doc of docs ?? []) {
    if (doc.slug === target) continue;
    for (const { key, ref: candidate } of collectNeighborRefs(doc)) {
      if (candidate !== target) continue;
      hits.push({ slug: doc.slug, via: key });
      break;
    }
  }
  return hits.sort((a, b) => a.slug.localeCompare(b.slug));
}

/**
 * Extracts *one prose paragraph* from a body as an excerpt, so the body preview an
 * agent receives from `get_concept` is the *first sentence a human meant to write*
 * rather than markdown table or code-block syntax.
 *
 * Line-based algorithm:
 *   1. Skip blank lines, headings, code blocks, tables, images, rules, lists, quotes.
 *   2. If the first non-empty line is prose, collect through the end of its
 *      paragraph (next blank line, or the start of a block).
 *   3. If no prose is found, fall back to `body.slice(0, maxLen)`.
 *   4. Cap at `maxLen` (default 800); trim and append '…' beyond it.
 *
 * Independent of the graph schema (NEIGHBOR_KEYS and friends) — a plain string
 * helper, exported so it can be unit-tested.
 */
export function extractSummaryExcerpt(body, maxLen = 800) {
  if (typeof body !== 'string' || body.length === 0) return '';
  const lines = body.split('\n');
  const isBlockStart = (line) => {
    const trimmed = line.trim();
    if (trimmed === '') return false;
    if (trimmed.startsWith('```')) return true; // Code block
    if (trimmed.startsWith('|')) return true; // table
    if (trimmed.startsWith('#')) return true; // heading
    if (trimmed.startsWith('![')) return true; // image
    if (/^([-*_])(?:\s*\1){2,}$/.test(trimmed)) return true; // thematic break
    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) return true; // list
    if (/^\d+[.)]\s+/.test(trimmed)) return true; // ordered list
    if (trimmed.startsWith('> ')) return true; // quote
    return false;
  };
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();
    if (trimmed === '' || isBlockStart(line)) {
      // Skip the whole inside of the code block — scan forward to the next ```
      if (trimmed.startsWith('```')) {
        i += 1;
        while (i < lines.length && !lines[i].trim().startsWith('```')) i += 1;
      }
      i += 1;
      continue;
    }
    // Prose paragraph begins — collect to the next blank line or block start
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
  // No prose line found — fall back to the raw body
  const trimmedBody = body.trim();
  return trimmedBody.length > maxLen
    ? trimmedBody.slice(0, maxLen).trimEnd() + '…'
    : trimmedBody;
}

/**
 * Maximum characters `body: 'full'` returns in one call.
 *
 * Why there is a cap at all: a `.md` inside a vault is any file on the user's
 * disk, and one pasted log can be hundreds of KB. This stops a single document
 * eating an agent's whole context. Measured vault bodies run 1–3 KB, so almost
 * nothing reaches the cap, and what does is reported by {@link describeBodyDelivery}.
 */
export const FULL_BODY_MAX_CHARS = 40_000;

/**
 * Selector cap for one `get_concepts({ body: "full" })` call.
 *
 * Full bodies make each row's payload large, so this is narrower than the general
 * batch cap of 50. Code that builds runnable read workflows (meaning repair, for
 * one) must use the same value, or a handoff will emit a call the server rejects.
 */
export const GET_CONCEPTS_FULL_BODY_MAX = 20;

/**
 * Reports **how much body was returned and what was not**.
 *
 * Why this is separate (measured 2026-08-01): an agent handed only the vault
 * answered — *"MCP `get_concept` returns the body as an excerpt only. Each node's
 * body may hold more code evidence, but that part was outside the scope of this
 * read."* The construction rules **require** evidence, confidence, and
 * inclusion/exclusion to be written in the body, and the read tool returned the
 * first paragraph while **saying nothing about the cut**. Not knowing what is
 * missing means you cannot ask for it — half of what was written was unreachable.
 *
 * So the contract here is two lines:
 *
 * 1. When cut, report `truncated: true` and **how many characters were withheld**.
 * 2. Only when cut, put **the exact call that fetches the rest** in `hint`. An
 *    untruncated response has no `hint` at all — no payload on a clean answer.
 *
 * @param {string} body raw markdown body
 * @param {object} [options]
 * @param {'excerpt'|'full'} [options.mode] defaults to `'excerpt'`
 * @param {number} [options.maxLen] excerpt cap (default 800)
 * @param {string} [options.hint] follow-up call to attach when truncated
 * @returns {{ text: string, info: { mode: string, totalChars: number, returnedChars: number, truncated: boolean, omittedChars?: number, hint?: string } }}
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
  // An excerpt joins lines with spaces, so **a character-count comparison cannot
  // decide this** — one newline of difference turns a fully delivered body into
  // "truncated". Compare with whitespace normalised: only skipping a table, a code
  // block, or a second paragraph counts as a cut; a whole one-paragraph body does not.
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

/**
 * Walks every `.md` under the vault root, excluding dotfiles, node_modules, and
 * the like. Returns each file's absolute path.
 */
export function walkMd(rootPath) {
  const out = [];
  const stack = [rootPath];
  const SKIP_DIRS = new Set([
    'node_modules',
    '.next',
    '.git',
    'out',
    'build',
    'dist',
    '.serena',
  ]);
  while (stack.length > 0) {
    const dir = stack.pop();
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        stack.push(join(dir, entry.name));
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        out.push(join(dir, entry.name));
      }
    }
  }
  return out;
}

/**
 * File path → vault-relative slug (`projects/foo.md` → `projects/foo`).
 *
 * **Normalised to NFC** (measured 2026-07-29). macOS commonly hands back Korean
 * filenames as NFD (decomposed jamo) — HFS+ copies, unzipped archives, zips built
 * by non-macOS toolchains — while what a user types into frontmatter is NFC. The
 * two strings are **character-identical but byte-different**.
 *
 * That produced this:
 *
 *   validate: `Korean` does not resolve to any node in the vault
 *   list:     domain  Korean  NFD file        ← the node is on the very next line
 *
 * The compiler failed alongside it, so edges into that node dropped to
 * `resolved: false` — **nodes with Korean names lose their relations**, on this
 * product's primary platform. The difference is invisible, so the user cannot fix it.
 *
 * Normalisation applies **to identifiers only**. Disk paths are untouched: the
 * file stays NFD and is read as NFD.
 */
export function pathToSlug(rootPath, filePath) {
  const rel = relative(rootPath, filePath).replace(/\\/g, '/');
  return rel.replace(/\.md$/, '').normalize('NFC');
}

/**
 * vault-relative slug → file path (extension appended automatically).
 *
 * Security: a malicious slug from an agent or prompt injection (`../../etc/passwd`
 * and friends) must not be able to name a file outside the vault root, so the path
 * is normalised and then checked to contain the root. A violation throws, and
 * every caller (writeDoc, readDoc, patchFrontmatter, updateDoc, deleteDoc) fails
 * with it — blocking reads and writes outside the vault alike.
 */
export function slugToPath(rootPath, slug) {
  if (typeof slug !== 'string' || slug.length === 0) {
    throw new Error('slug must be a non-empty string');
  }
  // Block null-byte injection — the Node fs API truncates on it in some environments.
  if (slug.includes('\0')) {
    throw new Error('slug must not contain a null byte');
  }
  const candidate = resolve(rootPath, `${slug}.md`);
  const normalizedRoot = resolve(rootPath);
  // The candidate must join the rootPath prefix on a separator: either exactly
  // normalizedRoot, or normalizedRoot + sep.
  if (
    candidate !== normalizedRoot &&
    !candidate.startsWith(normalizedRoot + sep)
  ) {
    throw new Error(`slug points outside the vault root: "${slug}"`);
  }
  // **A string check alone cannot stop a symlink** (measured 2026-07-29).
  //
  // The check above only asks whether the **path string** from `resolve()` sits
  // inside the root. But if `escape.md` inside the vault links to a file outside
  // it, the string is perfectly inside the root and `writeFileSync` follows the
  // link and **writes outside**. Measured: `relate escape real --vault
  // /tmp/sym/vault` edited `/tmp/sym/outside.md` and reported `wrote
  // /tmp/sym/vault/escape.md` — the user cannot find their edit at that path.
  //
  // The very threat this function's own doc-block names — *"a malicious slug from
  // an agent or prompt injection must not name a file outside the vault root"* —
  // was open on the **filesystem** side rather than the slug side.
  //
  // Only existing paths are realpath'd: creating a new file (a path that does not
  // exist yet) is normal, and its parent directory is checked below.
  assertRealPathInside(candidate, normalizedRoot, slug);
  return candidate;
}

/**
 * Whether the real path (after symlink resolution) is still inside the vault. When
 * the file does not exist yet, the nearest **existing ancestor** is used instead —
 * creating a new file inside a linked directory is the same escape.
 */
function assertRealPathInside(candidate, normalizedRoot, slug) {
  let realRoot;
  try {
    realRoot = realpathSync(normalizedRoot);
  } catch {
    // If the root itself cannot be resolved, the string check is all we can do.
    return;
  }
  let probe = candidate;
  for (;;) {
    try {
      const real = realpathSync(probe);
      if (real !== realRoot && !real.startsWith(realRoot + sep)) {
        throw new Error(
          `slug resolves outside the vault root through a symlink: "${slug}"`,
        );
      }
      return;
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('slug resolves outside')) throw error;
      const parent = dirname(probe);
      // Walked to the filesystem root with no existing ancestor — nothing left to check.
      if (parent === probe) return;
      probe = parent;
    }
  }
}

/**
 * Whether a `.md` for the given slug exists in the vault. Used to validate agent
 * input (add_relation and friends) so a typo or hallucinated slug is not silently
 * appended to a frontmatter array as a dangling reference.
 *
 * A malformed slug (empty, null byte, outside the vault) returns false rather than
 * throwing out of slugToPath, so the caller can branch on a boolean. A genuine fs
 * error surfaces naturally on the caller's follow-up read.
 */
/**
 * Returns the exact on-disk spelling of an existing slug, or `null`.
 *
 * **Why letter case needs its own resolver** (bug sweep 2026-09-01, reproduced).
 * `existsSync` follows the filesystem's case rules, so on macOS and Windows a
 * wrong-case slug (`capabilities/Auth` for `auth.md`) passes every existence
 * gate — but every backlink match below is a case-sensitive string comparison.
 * Reproduced: `rename_concept` deleted `auth.md`, created `authn.md`, redirected
 * **0** backlinks, and reported success. Destructive tools must therefore
 * operate on the disk's spelling, never the caller's.
 *
 * Matching walks one directory level per slug segment: exact entry first, then a
 * unique case-insensitive entry. On a case-sensitive filesystem this makes a
 * wrong-case slug resolve the same way it already does on macOS, so behaviour
 * stops depending on the platform. If the path exists but a segment cannot be
 * matched (for example Unicode normalization differences between the slug and
 * the directory listing), the input slug is returned unchanged — never worse
 * than the old `existsSync` behaviour.
 */
export function canonicalDiskSlug(rootPath, slug) {
  if (typeof slug !== 'string' || slug.length === 0) return null;
  let contained;
  try {
    contained = slugToPath(rootPath, slug);
  } catch {
    return null;
  }
  const existsAsGiven = existsSync(contained);
  const parts = slug.split('/');
  let dir = resolve(rootPath);
  const canonical = [];
  for (let i = 0; i < parts.length; i += 1) {
    const want = i === parts.length - 1 ? `${parts[i]}.md` : parts[i];
    let entries;
    try {
      entries = readdirSync(dir);
    } catch {
      return existsAsGiven ? slug : null;
    }
    let hit = entries.includes(want) ? want : null;
    if (hit === null) {
      const lower = want.toLowerCase();
      const caseMatches = entries.filter((entry) => entry.toLowerCase() === lower);
      if (caseMatches.length !== 1) return existsAsGiven ? slug : null;
      hit = caseMatches[0];
    }
    canonical.push(i === parts.length - 1 ? hit.slice(0, -3) : hit);
    dir = join(dir, hit);
  }
  return canonical.join('/');
}

export function vaultSlugExists(rootPath, slug) {
  if (typeof slug !== 'string' || slug.length === 0) return false;
  let candidate;
  try {
    candidate = slugToPath(rootPath, slug);
  } catch {
    return false;
  }
  return existsSync(candidate);
}

/**
 * Reads one `.md` into `{ slug, frontmatter, body, raw, mtime }`.
 *
 * `mtime` is the file's mtimeMs at read time; passing it as `expectedMtime` on a
 * later write is what makes conflict detection work.
 */
export function readDoc(rootPath, filePath) {
  const snapshot = readStableFileSnapshot(filePath);
  const raw = snapshot.raw;
  const { frontmatter, body, diagnostics } = parseFrontmatter(raw);
  const result = {
    slug: pathToSlug(rootPath, filePath),
    frontmatter,
    body,
    raw,
    mtime: snapshot.mtime,
  };
  if (diagnostics?.length) result.diagnostics = diagnostics;
  return result;
}

/**
 * Loads every doc in the vault as a manifest, leaving filtering to the caller.
 * Heavy on a large vault, but MCP calls are infrequent enough that it is fine.
 */
export function loadVaultDocs(rootPath) {
  const files = walkMd(rootPath);
  return files.map((path) => readDoc(rootPath, path));
}

/**
 * Returns slug candidates similar to `badSlug`, so an agent that hit not-found via
 * a typo or a missing prefix gets its next action.
 *
 * Matching stages, first hit wins:
 *  1. Exact tail match — input `auth` → `capabilities/auth`, `domains/auth`, ….
 *  2. Tail substring, either direction — `auth` ⊂ `auth-platform`, `oauth` ⊃ `auth`.
 *  3. Tail prefix — the user typed only part of it.
 *
 * `badSlug` itself is excluded. Returns up to `limit` (default 3).
 *
 * Substring comparison only. A distance metric such as Levenshtein is expensive on
 * a large vault and yields many false positives, and the goal here is not "did you
 * mean" — it is showing "these slugs exist in the vault" in one call.
 */
export function suggestSimilarSlugs(rootPath, badSlug, limit = 3) {
  if (typeof badSlug !== 'string' || badSlug.length === 0) return [];
  const docs = loadVaultDocs(rootPath);
  const all = docs.map((d) => d.slug).filter((s) => s !== badSlug);
  const tail = badSlug.split('/').pop() || badSlug;
  const lowerTail = tail.toLowerCase();
  const lowerBad = badSlug.toLowerCase();
  const tier1 = []; // exact tail match
  const tier2 = []; // substring (either direction)
  const tier3 = []; // prefix match on tail or full slug
  for (const slug of all) {
    const candTail = (slug.split('/').pop() || slug).toLowerCase();
    if (candTail === lowerTail) {
      tier1.push(slug);
      continue;
    }
    if (
      candTail.includes(lowerTail)
      || lowerTail.includes(candTail)
      || slug.toLowerCase().includes(lowerBad)
    ) {
      tier2.push(slug);
      continue;
    }
    if (candTail.startsWith(lowerTail) || slug.toLowerCase().startsWith(lowerBad)) {
      tier3.push(slug);
    }
  }
  return [...tier1, ...tier2, ...tier3].slice(0, limit);
}

/**
 * Builds an actionable suffix so an agent receiving a not-found or duplicate error
 * can decide its next action immediately. Callers append it to the error message.
 */
function notFoundSuffix(rootPath, slug) {
  const suggestions = suggestSimilarSlugs(rootPath, slug);
  const lines = [
    `Use list_concepts() to see all slugs, or find_evidence({title:${JSON.stringify(slug)}}) to search by title.`,
  ];
  if (suggestions.length > 0) {
    lines.push(`Similar slugs in this vault: ${suggestions.map((s) => `"${s}"`).join(', ')}.`);
  }
  return lines.join(' ');
}

/* ------------------------------------------------------------------------- *
 * Node-eligibility gate (2026-07-31 council — `docs/DECISIONS.md`)
 *
 * This is the **logic canon** of the ontology construction spec. Values live in
 * `schema.mjs`, wording in `construction-rules.mjs`, and the judgement lives
 * here because here is the only place all three write doors meet.
 *
 * That last part is the whole reason the gate exists at all. The measured defect
 * was 92 `elements:` entries on one capability, 92 of which resolved to nothing
 * — and they did not arrive through `add_concept`, which is where every existing
 * warning lived. They accumulated through `patch_concept`, and `add_relation` is
 * a third door again. Guidance aimed at the creation path never met the growth
 * path. So the gate sits below all three, in `commitDoc`, and no door can opt out
 * by construction rather than by discipline.
 *
 * What it does NOT do:
 *
 *   - It never blocks a write. Every finding is advisory, following the
 *     `missing-expected-field` precedent. A rejection would strand an agent
 *     mid-batch with half a graph written and no way forward, and agents route
 *     around tools that punish them.
 *   - It never enforces a child count. There is no cap here in any form,
 *     per-kind or otherwise — a number a model can be told to stay under is a
 *     number it satisfies with two empty buckets named "Group A" and "Group B".
 * ------------------------------------------------------------------------- */

/**
 * Session state. Two jobs, both of which need memory the compiled vault cannot
 * have: *how often we have already spoken* about a node, and *what this machine
 * created in this run* (provenance — a static scan cannot distinguish five nodes
 * a person wrote over a week from five one batch emitted).
 */
const GATE = {
  findings: [],
  /** `slug\0code\0key` → the count we last spoke about. */
  noticed: new Map(),
  /** parent ref → slugs created under it during this session. */
  createdUnderParent: new Map(),
  /** parent ref → the sibling count we last spoke about. */
  noticedBulk: new Map(),
  /**
   * parent slug → child refs this session's writes ADDED to its graph arrays.
   *
   * The other provenance map watches children declaring a parent; this one
   * watches a parent's own list growing, which is the direction the 92 actually
   * came from (`patch_concept` on `elements:`, never a child announcing itself).
   */
  parentGrewBy: new Map(),
  /** Lazy slug index: { rootPath, names: Set<string> }. */
  index: null,
};

/** Test seam, and the reset a long-lived server would need if the vault root moved. */
export function resetNodeEligibilityGate() {
  GATE.findings = [];
  GATE.noticed.clear();
  GATE.createdUnderParent.clear();
  GATE.noticedBulk.clear();
  GATE.parentGrewBy.clear();
  GATE.index = null;
}

/**
 * Take the findings produced since the last drain, and clear them.
 *
 * Destructive on purpose: the caller turns them into one `postWriteMaintenance`
 * payload per tool response, and a finding delivered twice is a finding the
 * reader starts filtering.
 */
export function drainNodeEligibilityFindings() {
  const findings = GATE.findings;
  GATE.findings = [];
  return findings;
}

/**
 * Every name the vault answers to: canonical slugs, their tails, and frontmatter
 * `slug:` aliases — the same three the MCP resolver accepts, so the gate cannot
 * call "unresolved" something `get_concept` would happily return.
 */
function buildGateIndex(rootPath) {
  const names = new Set();
  for (const doc of loadVaultDocs(rootPath)) {
    names.add(doc.slug);
    const tail = doc.slug.split('/').pop();
    if (tail) names.add(tail);
    const fmSlug = doc.frontmatter?.slug;
    if (typeof fmSlug === 'string' && fmSlug.trim()) names.add(fmSlug.trim());
  }
  return { rootPath, names };
}

function gateIndex(rootPath, { rebuild = false } = {}) {
  if (rebuild || !GATE.index || GATE.index.rootPath !== rootPath) {
    GATE.index = buildGateIndex(rootPath);
  }
  return GATE.index;
}

/**
 * Resolve a reference against the vault, paying for a full scan only when the
 * cheap answer would be bad news.
 *
 * The index is a cache, and a cache can be stale in exactly one direction that
 * matters: a doc written by a human editor or another agent since we built it
 * would look missing. So a miss is never trusted — it triggers one rebuild and a
 * re-check. A clean vault therefore costs one scan per session; a dirty one
 * costs one scan per warning, which is the write nobody minds paying for.
 */
function gateResolves(rootPath, ref) {
  const name = String(ref).normalize('NFC');
  if (gateIndex(rootPath).names.has(name)) return true;
  return gateIndex(rootPath, { rebuild: true }).names.has(name);
}

/** Keep the cache warm across a batch instead of rebuilding on every row. */
function noteGateWrite(rootPath, slug) {
  if (!GATE.index || GATE.index.rootPath !== rootPath) return;
  GATE.index.names.add(slug);
  const tail = slug.split('/').pop();
  if (tail) GATE.index.names.add(tail);
}
/**
 * Drops the lazy gate index after a document leaves the vault. Additions can be
 * folded in (`noteGateWrite`), but a removal cannot: another slug may still
 * provide the same tail, so the only safe move is a rebuild on next use.
 * Without this, `gateResolves` kept answering true for a deleted / renamed /
 * merged-away slug for the rest of the session, silently suppressing the
 * dangling-graph-reference advisory (bug sweep 2026-09-01).
 */
function noteGateRemoval() {
  GATE.index = null;
}

/**
 * Speak on the first crossing, then only when the count crosses a new multiple.
 *
 * The council left the firing frequency open and this is the resolution default:
 * a channel that repeats itself on every write is the channel
 * `missing-expected-field` became — technically present, actually invisible.
 */
function shouldNotice(ledger, key, count, { threshold, multiple }) {
  if (count < threshold) return false;
  const last = ledger.get(key) ?? 0;
  if (last === 0) {
    ledger.set(key, count);
    return true;
  }
  if (Math.floor(count / multiple) > Math.floor(last / multiple)) {
    ledger.set(key, count);
    return true;
  }
  if (count > last) ledger.set(key, count);
  return false;
}

const {
  NOTICE_THRESHOLD,
  NOTICE_REPEAT_MULTIPLE,
  BULK_PROVENANCE_SIBLING_TRIGGER,
  REFERENCE_SAMPLE_LIMIT,
  BOOTSTRAP_FANOUT_TRIGGER,
  MIN_PARENTS_FOR_LIVE_PERCENTILE,
  DENSE_PARENT_RESOLUTION_FLOOR,
} = NODE_ELIGIBILITY_GATE;

/**
 * Which containment array makes a node a parent, per kind.
 *
 * Only two entries, and the absence of `project → domain` is deliberate: a vault
 * has a handful of projects at most, so any percentile over that sample is
 * describing nothing, and a constant invented for it would be the guess the
 * amendment's research exists to avoid.
 */
const DENSE_PARENT_RELATIONS = Object.freeze({
  domain: Object.freeze({ key: 'capabilities', childKind: 'capability', bootstrap: 'domain_to_capability' }),
  capability: Object.freeze({ key: 'elements', childKind: 'element', bootstrap: 'capability_to_element' }),
});

/** Nearest-rank p90: no interpolation, so the answer is always an observed count. */
function percentile90(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(0.9 * sorted.length) - 1)];
}

/**
 * What counts as "wide" for this kind of parent, and where that number came from.
 *
 * The vault's own p90 wins as soon as there are enough parents of the kind for a
 * percentile to describe anything real; below that the researched starting range
 * stands in. Reporting the basis alongside the number is not decoration — a
 * bootstrap constant printed as "your vault's p90" would dress a shipped default
 * as a measurement of the reader's own data.
 *
 * Costs a full vault scan, so it is computed only after the caller has already
 * decided this parent is worth a sentence.
 */
function siblingFanoutTrigger(rootPath, parentKind) {
  const relation = DENSE_PARENT_RELATIONS[parentKind];
  const counts = [];
  for (const doc of loadVaultDocs(rootPath)) {
    if (doc.frontmatter?.kind !== parentKind) continue;
    const refs = doc.frontmatter[relation.key];
    counts.push(
      Array.isArray(refs) ? refs.filter((ref) => gateResolves(rootPath, ref)).length : 0,
    );
  }
  if (counts.length < MIN_PARENTS_FOR_LIVE_PERCENTILE) {
    return { trigger: BOOTSTRAP_FANOUT_TRIGGER[relation.bootstrap], basis: 'bootstrap' };
  }
  return { trigger: percentile90(counts), basis: 'vault-p90' };
}

/**
 * Did a machine fill this parent during this session?
 *
 * Two shapes of the same fact, because children arrive from both directions:
 * `createdUnderParent` sees a batch of children each declaring `domain:`, while
 * `parentGrewBy` sees one parent's own array growing through repeated writes —
 * which is the direction the measured 92 actually came from.
 */
function machineFilledParent(slug) {
  if (GATE.noticedBulk.has(slug)) return true;
  return (GATE.parentGrewBy.get(slug)?.size ?? 0) >= BULK_PROVENANCE_SIBLING_TRIGGER;
}

function pushRefFinding(slug, code, key, refs, message) {
  const noticeKey = `${slug}\0${code}\0${key}`;
  if (!shouldNotice(GATE.noticed, noticeKey, refs.length, {
    threshold: NOTICE_THRESHOLD,
    multiple: NOTICE_REPEAT_MULTIPLE,
  })) {
    return;
  }
  GATE.findings.push({
    code,
    slug,
    key,
    refs,
    count: refs.length,
    message: message({ slug, key, refs, count: refs.length, sampleLimit: REFERENCE_SAMPLE_LIMIT }),
  });
}

/**
 * The gate. Runs on the committed frontmatter, after the file is on disk —
 * observing, never gating, which is what "warn, don't reject" means mechanically.
 *
 * @param {string} rootPath
 * @param {string} slug
 * @param {Record<string, unknown>} frontmatter
 * @param {{ created?: boolean }} [options] `created` marks a brand-new node, the
 *   only case where bulk provenance means anything.
 */
function runNodeEligibilityGate(rootPath, slug, frontmatter, { created = false } = {}) {
  if (!frontmatter || typeof frontmatter !== 'object') return;

  // ⓪ A capability born with no evidence. Creation only — the honest sequence is
  //    "name the behavior, attach the file", so a node that lacks evidence on a
  //    LATER write is not yet wrong and does not deserve a repeated accusation.
  //    `maintenance_plan` carries the durable version of the question.
  if (created && frontmatter.kind === 'capability') {
    const elements = Array.isArray(frontmatter.elements) ? frontmatter.elements : [];
    const hasEvidence = hasCapabilityImplementationEvidence({
      path: frontmatter.path,
      hasElementsEdge: elements.some((ref) => gateResolves(rootPath, ref)),
    });
    if (!hasEvidence) {
      GATE.findings.push({
        code: 'capability-without-evidence',
        slug,
        key: 'path',
        refs: [],
        count: 1,
        message: capabilityWithoutEvidenceMessage({ slug }),
      });
    }
  }

  // ① A path in the title slot. An element names a role ("jwt-token"), not a
  //    location — a title that is a path means the author described evidence.
  const title = frontmatter.title;
  if (looksLikePath(title)) {
    if (shouldNotice(GATE.noticed, `${slug}\0path-shaped-title\0title`, 1, {
      threshold: NOTICE_THRESHOLD,
      multiple: NOTICE_REPEAT_MULTIPLE,
    })) {
      GATE.findings.push({
        code: 'path-shaped-title',
        slug,
        key: 'title',
        refs: [String(title)],
        count: 1,
        message: pathShapedTitleMessage(String(title)),
      });
    }
  }

  // ② Reference resolution. This is the check the vault-wide validator has and
  //    the write path did not — and note the validator *exempts* path-shaped
  //    `elements:` entries outright, which is precisely why 92 of them were
  //    invisible to `validate_vault` while sitting in the graph. Here nothing is
  //    exempt; the path shape only chooses which repair the message names first.
  const evidenceByKey = new Map();
  const danglingByKey = new Map();
  let totalRefs = 0;
  let resolvedRefs = 0;
  for (const { key, ref } of collectNeighborRefs({ frontmatter })) {
    totalRefs += 1;
    if (gateResolves(rootPath, ref)) {
      resolvedRefs += 1;
      continue;
    }
    const bucket = looksLikeEvidencePath(ref) ? evidenceByKey : danglingByKey;
    if (!bucket.has(key)) bucket.set(key, []);
    bucket.get(key).push(ref);
  }
  for (const [key, refs] of evidenceByKey) {
    pushRefFinding(slug, 'path-shaped-reference', key, refs, pathShapedReferenceMessage);
  }
  for (const [key, refs] of danglingByKey) {
    pushRefFinding(slug, 'dangling-graph-reference', key, refs, danglingGraphReferenceMessage);
  }

  // ③ Dense parent. The one check with a number attached, so it is also the one
  //    that could quietly become the fan-out cap the council threw out. Two
  //    guards keep it from doing that.
  //
  //    First, it only ever fires when something ELSE is already wrong: the
  //    parent's references are mostly broken, or a machine filled it in this
  //    session. A wide parent whose children all resolve and were added by hand
  //    is never mentioned — schema.org's `CreativeWork` has 67 direct subtypes
  //    and is not sick, and this vault's own `topology-kind-legibility` (7
  //    elements, all resolving) must stay silent. That precondition runs BEFORE
  //    the percentile so the healthy case never even pays for the scan.
  //
  //    Second, unresolved strings are not counted as children. Counting them
  //    would make the very defect this gate exists to name look like healthy
  //    growth.
  const relation = DENSE_PARENT_RELATIONS[frontmatter.kind];
  if (relation) {
    const childRefs = Array.isArray(frontmatter[relation.key]) ? frontmatter[relation.key] : [];
    const resolvedChildren = childRefs.filter((ref) => gateResolves(rootPath, ref));
    const resolutionRate = totalRefs === 0 ? 1 : resolvedRefs / totalRefs;
    const brokenParent = resolutionRate < DENSE_PARENT_RESOLUTION_FLOOR;
    const machineFilled = machineFilledParent(slug);
    if (resolvedChildren.length > 0 && (brokenParent || machineFilled)) {
      const { trigger, basis } = siblingFanoutTrigger(rootPath, frontmatter.kind);
      if (shouldNotice(GATE.noticed, `${slug}\0dense-parent\0${relation.key}`, resolvedChildren.length, {
        threshold: trigger + 1, // "above the trigger", not "at" it
        multiple: NOTICE_REPEAT_MULTIPLE,
      })) {
        GATE.findings.push({
          code: 'dense-parent',
          slug,
          key: relation.key,
          refs: resolvedChildren,
          count: resolvedChildren.length,
          trigger,
          basis,
          message: denseParentActionMessage({
            parentSlug: slug,
            count: resolvedChildren.length,
            childKind: relation.childKind,
            trigger,
            basis,
            evidence: brokenParent
              ? `only ${Math.round(resolutionRate * 100)}% of this node's graph references resolve to real nodes`
              : 'a single session filled this parent, so its children share a provenance rather than a reason',
          }),
        });
      }
    }
  }

  // ④ Bulk provenance. Not a size limit — a statement about *who* made these and
  //    *when*. Only the write path can know that, which is the entire argument
  //    for putting this check here rather than in the compiled maintenance plan.
  if (!created) return;
  const parent = typeof frontmatter.domain === 'string' ? frontmatter.domain.trim() : '';
  if (!parent) return;
  const siblings = GATE.createdUnderParent.get(parent) ?? [];
  if (!siblings.includes(slug)) siblings.push(slug);
  GATE.createdUnderParent.set(parent, siblings);
  if (shouldNotice(GATE.noticedBulk, parent, siblings.length, {
    threshold: BULK_PROVENANCE_SIBLING_TRIGGER,
    multiple: BULK_PROVENANCE_SIBLING_TRIGGER,
  })) {
    GATE.findings.push({
      code: 'bulk-provenance',
      slug,
      parent,
      count: siblings.length,
      refs: siblings.slice(),
      message: bulkProvenanceMessage({
        parent,
        count: siblings.length,
        slugs: siblings,
        sampleLimit: REFERENCE_SAMPLE_LIMIT,
      }),
    });
  }
}

/**
 * **The single write point.** `writeDoc`, `patchFrontmatter`, and `updateDoc`
 * all serialize here — so `add_concept`, `add_relation`, and `patch_concept`
 * inherit the gate whether or not their author remembered it existed.
 *
 * `mcp/src/write-path-gate.test.mjs` fails if a door starts writing bytes
 * somewhere else.
 */
function commitDoc(
  rootPath,
  slug,
  filePath,
  frontmatter,
  body,
  {
    created = false,
    previousFrontmatter,
    expectedRaw,
    expectedMtime,
    beforeCommit,
  } = {},
) {
  writeFileAtomically(filePath, buildMarkdown({ frontmatter, body }), {
    expectedRaw,
    expectedAbsent: created,
    conflictSlug: created ? undefined : slug,
    expectedMtime,
    beforeCommit,
  });
  if (created) noteGateWrite(rootPath, slug);
  noteParentGrowth(slug, previousFrontmatter, frontmatter);
  runNodeEligibilityGate(rootPath, slug, frontmatter, { created });
  return filePath;
}

function identityClaims(frontmatter) {
  const primary = typeof frontmatter?.uid === 'string' ? frontmatter.uid : '';
  const merged = Array.isArray(frontmatter?.merged_uids) ? frontmatter.merged_uids : [];
  return [...new Set([primary, ...merged].filter(Boolean))];
}

function assertNodeIdentity(rootPath, slug, frontmatter) {
  const kind = frontmatter?.kind;
  if (typeof kind !== 'string' || !kind.trim()) return;
  const uidIssue = nodeUidIssue(frontmatter.uid);
  if (uidIssue) throw new Error(uidIssue);
  const merged = inspectMergedUids(frontmatter.uid, frontmatter.merged_uids);
  if (merged.invalidIssue) throw new Error(merged.invalidIssue);
  if (merged.nonCanonical) {
    throw new Error('`merged_uids:` must be a deduplicated, ascending canonical UUIDv4 set.');
  }
  const claims = new Set(identityClaims(frontmatter));
  for (const doc of loadVaultDocs(rootPath)) {
    if (doc.slug === slug) continue;
    for (const claimed of identityClaims(doc.frontmatter)) {
      if (!claims.has(claimed)) continue;
      throw new Error(
        `UID collision: ${claimed} already belongs to "${doc.slug}". ` +
          'Create a new node with a fresh UID, or use merge_concepts to absorb an existing identity.',
      );
    }
  }
}

/**
 * Does a hand-authored node **not yet have an identity**? If it has one it is
 * immutable; if not, there is a slot to fill.
 *
 * A node written directly in Obsidian, vim, or the GitHub web editor has no
 * `uid:`. This repository promises that «you can just write the markdown by
 * hand», so that state is legitimate input — but left alone, the compile stops on
 * an identity error and **every graph command on the whole vault dies**
 * (overview, health, agent-brief, query_ontology).
 */
function hasSettledUid(frontmatter) {
  return typeof frontmatter?.uid === 'string' && frontmatter.uid.trim() !== '';
}

/**
 * ⚠️ **Immutability applies only to changing a value that was there** (2026-08-08).
 *
 * Filling an absent value for the first time used to be refused by the same
 * sentence, which left an agent carrying only Atlas MCP with **no door at all**
 * for fixing a hand-authored node:
 *
 * | attempt | old response |
 * |---|---|
 * | `patch_concept` (other fields, no uid) | "`uid:` must be a UUIDv4" |
 * | `patch_concept({uid: <new value>})` | "`uid:` is immutable" |
 * | `add_concept` (same slug) | "already exists; use patch" |
 *
 * The three pointed at each other in a closed loop (reproduced 2026-08-08). With
 * no value to change, nothing is being changed. The real risk — taking over
 * someone else's identity — is already blocked separately by the collision check
 * in `assertNodeIdentity`, so opening this door still makes identity theft
 * impossible.
 */
function assertIdentityPatch(previousFrontmatter, patch) {
  if (!patch) return;
  if ('uid' in patch && patch.uid !== undefined && patch.uid !== previousFrontmatter.uid) {
    if (hasSettledUid(previousFrontmatter)) {
      throw new Error('`uid:` is immutable. Rename or reclassify the node without changing its UID.');
    }
  }
  if ('uid' in patch && patch.uid === null && hasSettledUid(previousFrontmatter)) {
    throw new Error('`uid:` is immutable. Rename or reclassify the node without changing its UID.');
  }
  if ('merged_uids' in patch) {
    throw new Error('`merged_uids:` is merge_concepts-owned identity history and cannot be edited by a generic patch.');
  }
}

/**
 * When a node without identity is edited, **that write mints the identity**.
 *
 * The writer minting it is exactly this repository's contract ("writer-minted
 * immutable UUIDv4"). A hand-authored node simply had no minter yet, and the
 * first write to touch it takes that role.
 *
 * **Not silently** — the minted value rides the return so the caller can tell the
 * person. Identity coming into existence is an event a person should know about.
 */
function fillMissingUid(previousFrontmatter, nextFrontmatter) {
  const kind = nextFrontmatter?.kind;
  if (typeof kind !== 'string' || !kind.trim()) return null;
  if (hasSettledUid(previousFrontmatter)) return null;
  if (hasSettledUid(nextFrontmatter)) return nextFrontmatter.uid;
  const minted = generateNodeUid();
  nextFrontmatter.uid = minted;
  return minted;
}

/**
 * Record which child refs THIS write added to a parent's graph arrays.
 *
 * Provenance the vault cannot reconstruct afterwards: on disk, a child added by
 * a person over a week and one appended by a loop look identical. The diff is
 * only visible in the moment of writing, which is the same argument that put the
 * whole gate here rather than in the compiled plan.
 */
function noteParentGrowth(slug, previousFrontmatter, nextFrontmatter) {
  if (!previousFrontmatter) return;
  for (const key of GRAPH_ARRAY_KEYS) {
    const next = nextFrontmatter?.[key];
    if (!Array.isArray(next)) continue;
    const before = new Set(Array.isArray(previousFrontmatter[key]) ? previousFrontmatter[key] : []);
    for (const ref of next) {
      if (typeof ref !== 'string' || before.has(ref)) continue;
      const added = GATE.parentGrewBy.get(slug) ?? new Set();
      added.add(ref);
      GATE.parentGrewBy.set(slug, added);
    }
  }
}

/**
 * Writes a new doc, creating directories as needed. Throws if the file exists —
 * an overwrite has to be the caller's explicit choice.
 */
export function writeDoc(rootPath, slug, { frontmatter, body = '' }) {
  const filePath = slugToPath(rootPath, slug);
  if (existsSync(filePath)) {
    throw new Error(
      `Doc already exists at "${slug}". To update fields, use patch_concept(slug, frontmatter, body, expected_mtime). To rename, use rename_concept(oldSlug, newSlug). Never delete-then-add: that loses backlinks.`,
    );
  }
  assertPlainObject(frontmatter, 'frontmatter');
  if (typeof body !== 'string') {
    throw new Error('body must be a string.');
  }
  // Slug flatness — measured at the one door where a new identity is born. This
  // is shape validity, so it is a hard error (the fan-out gate's "never block"
  // principle covers judgements of meaning only).
  const slugIssue = flatSlugIssue(frontmatter?.kind, slug);
  if (slugIssue) throw new Error(slugIssue);
  assertNodeIdentity(rootPath, slug, frontmatter);
  mkdirSync(dirname(filePath), { recursive: true });
  return commitDoc(rootPath, slug, filePath, frontmatter, body, { created: true });
}

/**
 * Options shape for patchFrontmatter / updateDoc / deleteDoc / redirectBacklinks:
 *   { expectedMtime?: number }
 *
 * When the caller passes the mtime it read, a change detected just before the
 * write throws a conflict. Omitting it skips the check, keeping existing callers
 * working.
 */

/**
 * Deletes a doc permanently. Confirmation and backlink checks are the caller's
 * responsibility. Returns `{ slug, filePath, frontmatter, body, raw, mtime }`
 * captured just before the delete, throws when the file is absent, and honours
 * `expectedMtime` for external-change detection.
 */
export function deleteDoc(rootPath, slug, options = {}) {
  const filePath = slugToPath(rootPath, slug);
  if (!existsSync(filePath)) {
    throw new Error(`Doc not found: "${slug}". ${notFoundSuffix(rootPath, slug)}`);
  }
  const captured = readDoc(rootPath, filePath);
  assertSnapshotMtime(slug, options.expectedMtime, captured.mtime);
  options.beforeDelete?.();
  assertCurrentDocSnapshot(slug, filePath, captured.raw, captured.mtime);
  unlinkSync(filePath);
  noteGateRemoval();
  return { ...captured, filePath };
}

/**
 * Patches only the frontmatter of an existing doc, preserving the body. In the
 * patch object, `null` deletes the key and `undefined` skips it.
 * `options.expectedMtime` enables external-change detection.
 *
 * Returns `{ filePath, frontmatter, mintedUid }`. `mintedUid` has a value **only
 * when this write minted the identity for the first time** (recovering a
 * hand-authored node) — the caller must tell the person, because identity coming
 * into existence is not an event to pass over silently.
 */
export function patchFrontmatter(rootPath, slug, patch, options = {}) {
  const filePath = slugToPath(rootPath, slug);
  if (!existsSync(filePath)) {
    throw new Error(`Doc not found: "${slug}". ${notFoundSuffix(rootPath, slug)}`);
  }
  assertPlainObject(patch, 'frontmatter');
  const doc = readDoc(rootPath, filePath);
  assertSnapshotMtime(slug, options.expectedMtime, doc.mtime);
  const { frontmatter, body } = doc;
  assertIdentityPatch(frontmatter, patch);
  const next = { ...frontmatter };
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) {
      delete next[key];
    } else if (value !== undefined) {
      next[key] = normalizeFrontmatterValue(key, value);
    }
  }
  const mintedUid = fillMissingUid(frontmatter, next);
  assertNodeIdentity(rootPath, slug, next);
  commitDoc(rootPath, slug, filePath, next, body, {
    previousFrontmatter: frontmatter,
    expectedRaw: doc.raw,
    expectedMtime: doc.mtime,
    beforeCommit: options.beforeCommit,
  });
  return { filePath, frontmatter: next, mintedUid };
}

/**
 * Updates frontmatter and body of an existing doc together. Frontmatter patch
 * semantics match patchFrontmatter (`null` deletes, `undefined` skips); a string
 * `body` replaces, `undefined` preserves. `expectedMtime` enables
 * external-change detection.
 *
 * The return contract matches `patchFrontmatter`: `{ filePath, frontmatter, mintedUid }`.
 */
export function updateDoc(rootPath, slug, {
  frontmatter: patch,
  body,
  expectedMtime,
  beforeCommit,
}) {
  const filePath = slugToPath(rootPath, slug);
  if (!existsSync(filePath)) {
    throw new Error(`Doc not found: "${slug}". ${notFoundSuffix(rootPath, slug)}`);
  }
  assertOptionalPlainObject(patch, 'frontmatter');
  const doc = readDoc(rootPath, filePath);
  assertSnapshotMtime(slug, expectedMtime, doc.mtime);
  const { frontmatter, body: oldBody } = doc;
  assertIdentityPatch(frontmatter, patch);
  const nextFm = { ...frontmatter };
  if (patch !== undefined) {
    for (const [key, value] of Object.entries(patch)) {
      if (value === null) {
        delete nextFm[key];
      } else if (value !== undefined) {
        nextFm[key] = normalizeFrontmatterValue(key, value);
      }
    }
  }
  if (body !== undefined && typeof body !== 'string') {
    throw new Error('body must be a string.');
  }
  const nextBody = body === undefined ? oldBody : body;
  const mintedUid = fillMissingUid(frontmatter, nextFm);
  assertNodeIdentity(rootPath, slug, nextFm);
  commitDoc(rootPath, slug, filePath, nextFm, nextBody, {
    previousFrontmatter: frontmatter,
    expectedRaw: doc.raw,
    expectedMtime: doc.mtime,
    beforeCommit,
  });
  return { filePath, frontmatter: nextFm, mintedUid };
}

/**
 * Kind distribution for the vault: node count per kind plus the total. Lets an
 * agent answer inventory questions ("how many capabilities are in this vault?")
 * in one load plus one counting pass.
 */
export function listKinds(rootPath) {
  const docs = loadVaultDocs(rootPath);
  const byKind = {};
  let total = 0;
  const documentedNames = new Set();
  for (const doc of docs) {
    const kind = doc.frontmatter.kind;
    documentedNames.add(doc.slug);
    const tail = doc.slug.split('/').pop();
    if (tail) documentedNames.add(tail);
    const fmSlug = doc.frontmatter.slug;
    if (typeof fmSlug === 'string' && fmSlug.trim()) documentedNames.add(fmSlug.trim());
    if (typeof kind !== 'string' || !kind) continue;
    byKind[kind] = (byKind[kind] || 0) + 1;
    total += 1;
  }
  // Concepts named only in a relation key, with no document. The screens (map,
  // insights) count these as concepts too, so omitting this number makes `total`
  // alone read as "the screen inflated it". They are not in the per-kind
  // inventory — they never declared a kind.
  const referencedOnly = new Set();
  for (const doc of docs) {
    for (const { ref } of collectNeighborRefs(doc)) {
      if (!documentedNames.has(ref)) referencedOnly.add(ref);
    }
  }
  return {
    total,
    byKind,
    referencedOnlyTotal: referencedOnly.size,
    conceptsIncludingReferenced: total + referencedOnly.size,
  };
}

/**
 * Finds orphan nodes: docs that no other node points at from a frontmatter graph
 * key (domains/capabilities/elements/dependencies/relates/contains/describes/domain).
 * Matching policy matches findBacklinks (absolute slug, or the last segment).
 *
 * Options:
 *   - kind: restrict to one kind
 *   - excludeKinds: drop these kinds from the result (default ['project', 'vault-readme'])
 *
 * Used when an agent tidies isolated nodes, or a user asks which of their nodes
 * nothing uses.
 */
export function findOrphans(rootPath, options = {}) {
  const docs = loadVaultDocs(rootPath);
  const kindFilter = typeof options.kind === 'string' ? options.kind : null;
  const excludeKinds = new Set(
    Array.isArray(options.excludeKinds)
      ? options.excludeKinds
      : ['project', 'vault-readme'],
  );
  // "Is this node referenced?" is answered conservatively: an ambiguous ref
  // counts as a reference to **every** candidate, so no document a vault plainly
  // names is reported as an orphan (bug sweep 2026-09-01 — the private
  // first-wins map before this marked one of two same-tail nodes orphaned).
  const { resolveCandidates } = buildRefIndex(docs);
  const referenced = new Set();
  for (const doc of docs) {
    for (const { ref } of collectNeighborRefs(doc)) {
      for (const candidate of resolveCandidates(ref)) {
        if (candidate !== doc.slug) referenced.add(candidate);
      }
    }
  }
  const orphans = [];
  for (const doc of docs) {
    const kind = doc.frontmatter.kind;
    if (typeof kind !== 'string' || !kind) continue;
    if (excludeKinds.has(kind)) continue;
    if (kindFilter && kind !== kindFilter) continue;
    if (referenced.has(doc.slug)) continue;
    orphans.push({
      uid: doc.frontmatter.uid,
      slug: doc.slug,
      kind,
      title: doc.frontmatter.title || doc.frontmatter.name || doc.slug,
      // Same shape as list_concepts / find_backlinks, so an agent can sort or
      // filter orphans ("only in this domain", "only recently changed") straight
      // from the response, with no follow-up get_concept.
      domain: doc.frontmatter.domain,
      mtime: doc.mtime,
    });
  }
  return { total: orphans.length, orphans };
}

/**
 * Shortest graph path between two slugs (BFS). Edges come from the frontmatter
 * graph keys (domains, capabilities, elements, dependencies, relates, contains,
 * describes, domain) plus their backlinks, forming an undirected graph.
 *
 * An entry string matches either the absolute slug or the slug's last segment —
 * the same policy as findBacklinks.
 *
 * Returns null when no path exists; cuts off beyond `maxHops` (default 5).
 */
export function findPath(rootPath, fromSlug, toSlug, maxHops = 5) {
  assertBoundedNonNegativeInteger(maxHops, 'maxHops', { max: 20 });
  const docs = loadVaultDocs(rootPath);
  // The last segment and the frontmatter slug are aliases, so in a dogfood vault
  // where project.md carries a user-facing `slug: ontology-atlas`, traversal still
  // treats the file slug and the frontmatter slug as one node. The shared index
  // nulls an ambiguous ref, so a path is never routed through an arbitrary match
  // (bug sweep 2026-09-01 — this function used a private first-wins map before).
  const resolveRef = buildRefIndex(docs).resolve;
  const resolvedFrom = resolveRef(fromSlug);
  const resolvedTo = resolveRef(toSlug);
  // Both endpoints must exist in the vault for the answer to mean anything. Even
  // an identical slug returns a trivial path only when it is in the vault, so no
  // fake path is invented for a nonexistent slug (past regression: from===to on a
  // fabricated slug returned hops:[slug]).
  if (!resolvedFrom || !resolvedTo) return null;
  if (resolvedFrom === resolvedTo) return { from: fromSlug, to: toSlug, hops: [resolvedFrom], edges: [] };
  // adjacency: undirected, each edge recording the frontmatter `via` key (domains,
  // capabilities, elements, dependencies, relates, contains, describes, domain).
  // When one doc references the same neighbour under several keys, the *first* key
  // wins — NEIGHBOR_KEYS runs domains → describes, from most to least specific, so
  // the most specific meaning is kept. This lets an agent that receives a path
  // explain hop by hop why two nodes are connected, which carries far more of the
  // mental model than a bare slug sequence.
  // Each adjacency entry is `{ via, rationale? }`. The rationale is the source
  // document's `relation_notes` sentence for that target; it rides along in both
  // directions because the note explains the pair, whichever way BFS walks it.
  const adj = new Map();
  function addEdge(a, b, via, rationale) {
    if (!adj.has(a)) adj.set(a, new Map());
    if (!adj.has(b)) adj.set(b, new Map());
    const meta = rationale === undefined ? { via } : { via, rationale };
    if (!adj.get(a).has(b)) adj.get(a).set(b, meta);
    if (!adj.get(b).has(a)) adj.get(b).set(a, meta);
  }
  for (const doc of docs) {
    for (const { key, ref } of collectNeighborRefs(doc)) {
      const resolved = resolveRef(ref);
      if (resolved && resolved !== doc.slug) {
        addEdge(doc.slug, resolved, key, relationNoteFor(doc, ref, resolved));
      }
    }
  }
  // BFS carrying depth in the queue, which avoids walking the parent chain back on
  // every dequeue (O(D)). The queue runs on a head index too, removing
  // Array.shift()'s O(V) cost — measurable on a large vault.
  const queue = [{ node: resolvedFrom, depth: 0 }];
  const visited = new Set([resolvedFrom]);
  const parent = new Map();
  const parentEdge = new Map();
  let head = 0;
  while (head < queue.length) {
    const { node: cur, depth } = queue[head++];
    if (depth >= maxHops) continue;
    const neighbors = adj.get(cur) || new Map();
    for (const [n, meta] of neighbors) {
      if (visited.has(n)) continue;
      visited.add(n);
      parent.set(n, cur);
      parentEdge.set(n, meta);
      if (n === resolvedTo) {
        // Path reconstruction: push to the end, then reverse once (O(D)). It used
        // to `hops.unshift(p)` each step, i.e. O(D²) — an antipattern even with a
        // small maxHops. edges[] exposes the 'via' frontmatter key between hops i
        // and i+1, plus the stored `rationale` when the declaring document has one.
        const hops = [n];
        const edges = [];
        let p = n;
        while (parent.has(p)) {
          const prev = parent.get(p);
          edges.unshift({ from: prev, to: p, ...parentEdge.get(p) });
          p = prev;
          hops.push(p);
        }
        hops.reverse();
        return { from: fromSlug, to: toSlug, hops, edges };
      }
      queue.push({ node: n, depth: depth + 1 });
    }
  }
  return null;
}

/**
 * Scans which vault docs point at `targetSlug`, looking at the frontmatter array
 * keys (capabilities, elements, dependencies, relates, contains, describes) and at
 * wikilinks and markdown links in the body.
 */
export function findBacklinks(rootPath, targetSlug, options = {}) {
  // `includeAmbiguousTailRefs` widens the frontmatter match to documents whose
  // ref is ambiguous but **could** mean the target, each row marked
  // `ambiguousTail: true`. The default stays exact-only (standing decision — an
  // ambiguous tail is not misattributed as a confirmed backlink), but
  // delete_concept's safety gate opts in: without this, a node referenced only
  // via an ambiguous tail was deletable without force and without a warning
  // (bug sweep 2026-09-01, reproduced).
  const includeAmbiguous = options.includeAmbiguousTailRefs === true;
  const docs = loadVaultDocs(rootPath);
  const { resolve: resolveRef, resolveCandidates } = buildRefIndex(docs);
  const resolvedTarget = resolveRef(targetSlug) || targetSlug;
  const matches = [];
  // Graph frontmatter is read through collectNeighborRefs, so a legacy key such as
  // depends_on still reads as the canonical dependencies edge, and a targetSlug
  // that is a frontmatter slug alias still finds the same node.
  const requestedTail = targetSlug.split('/').pop();
  const resolvedTail = resolvedTarget.split('/').pop();
  const bodyNeedles = new Set([
    targetSlug,
    resolvedTarget,
    requestedTail,
    resolvedTail,
  ].filter(Boolean));
  for (const doc of docs) {
    if (doc.slug === resolvedTarget) continue;
    const matchedKeys = [];
    let ambiguousHit = false;
    for (const { key, ref } of collectNeighborRefs(doc)) {
      const resolved = resolveRef(ref);
      if (resolved === resolvedTarget) {
        if (!matchedKeys.includes(key)) matchedKeys.push(key);
        continue;
      }
      if (
        includeAmbiguous &&
        resolved === null &&
        resolveCandidates(ref).includes(resolvedTarget)
      ) {
        ambiguousHit = true;
        if (!matchedKeys.includes(key)) matchedKeys.push(key);
      }
    }
    // Wikilinks match their alias (`[[x|label]]`) and heading (`[[x#h]]`) forms
    // too — redirectBacklinks rewrites those, so this count must see them.
    const bodyHit = [...bodyNeedles].some(
      (needle) =>
        doc.body.includes(`[[${needle}]]`) ||
        doc.body.includes(`[[${needle}#`) ||
        doc.body.includes(`[[${needle}|`) ||
        doc.body.includes(`(${needle}.md`) ||
        doc.body.includes(`/${needle}.md`),
    );
    if (matchedKeys.length === 0 && !bodyHit) continue;
    matches.push({
      uid: doc.frontmatter.uid,
      slug: doc.slug,
      kind: doc.frontmatter.kind,
      title: doc.frontmatter.title || doc.frontmatter.name || doc.slug,
      // Same shape as list_concepts, so an agent reading backlinks immediately
      // knows the domain and the change time. Two views of one mental model
      // exposing the same fields is what lets an agent handle both identically.
      domain: doc.frontmatter.domain,
      mtime: doc.mtime,
      matchedKeys: matchedKeys.length > 0 ? matchedKeys : undefined,
      matchedInBody: bodyHit || undefined,
      ambiguousTail: ambiguousHit || undefined,
    });
  }
  return matches;
}

/**
 * One candidate-aware reference index shared by findPath, findOrphans and
 * findBacklinks (bug sweep 2026-09-01). Before it, three policies coexisted in
 * this file: buildRefResolver nulled ambiguous tails, while findPath and
 * findOrphans kept private first-wins maps — reproduced: with
 * `capabilities/foo.md` and `elements/foo.md`, `find_path` routed a path through
 * the arbitrary first match and `find_orphans` reported one of them as an orphan
 * a document plainly references. Policy now: an ambiguous ref asserts **no
 * specific edge** (resolve → null) but is a **candidate referrer of every
 * match** (resolveCandidates), so "is this node referenced?" checks stay
 * conservative.
 */
function buildRefIndex(docs) {
  const slugs = new Set(docs.map((d) => d.slug));
  const tailToFulls = new Map();
  const frontmatterSlugToFull = new Map();
  for (const slug of slugs) {
    const tail = slug.split('/').pop();
    if (!tail || tail === slug) continue;
    const list = tailToFulls.get(tail);
    if (list) list.push(slug);
    else tailToFulls.set(tail, [slug]);
  }
  for (const doc of docs) {
    const fmSlug = doc.frontmatter.slug;
    if (typeof fmSlug === 'string' && fmSlug.trim() && !frontmatterSlugToFull.has(fmSlug)) {
      frontmatterSlugToFull.set(fmSlug, doc.slug);
    }
  }
  function resolveCandidates(ref) {
    if (typeof ref !== 'string') return [];
    if (slugs.has(ref)) return [ref];
    if (frontmatterSlugToFull.has(ref)) return [frontmatterSlugToFull.get(ref)];
    const tails = tailToFulls.get(ref);
    if (tails) return [...tails];
    const suffixMatches = [];
    for (const slug of slugs) {
      if (slug.endsWith(`/${ref}`)) suffixMatches.push(slug);
    }
    return suffixMatches;
  }
  function resolve(ref) {
    const candidates = resolveCandidates(ref);
    return candidates.length === 1 ? candidates[0] : null;
  }
  return { slugs, resolve, resolveCandidates };
}


/**
 * Applies a multi-file vault write **all-or-nothing**.
 *
 * **Why it was needed — «atomic» was false.** `rename_concept`'s tool description
 * said *"update every backlink in one atomic graph-level operation"* and
 * `AGENTS.md` said *"atomically rewrites every backlink"*. In reality
 * `redirectBacklinks` wrote each file immediately inside a loop, and one failed
 * write left a **half vault** (measured 2026-08-01: `chmod 444` on one of three
 * references → new file created, old file not deleted → **two nodes with the same
 * title**, two references on the new name and one on the old).
 *
 * The worst part came next: on that vault `validate` answered *"issue 0 ✓"* and
 * `health` answered *"vault_validation pass"*. **A split graph passed both
 * checks.** On a product whose premise is that the user's disk is the source of
 * truth, that is the most expensive kind of silent failure.
 *
 * **Guaranteed:** **as long as the process lives**, any I/O failure (EACCES,
 * EROFS, ENOSPC, an editor lock, a read-only file left by a sync client) leaves
 * the vault as it started. Two stages — ① before writing anything, **pre-check
 * write permission on every target**, and ② if it still fails, restore what was
 * already written from the original bytes.
 *
 * **Not guaranteed: crash and power-loss safety.** That needs a journal or a
 * `rename(2)`-based commit, and it duplicates this product's recovery path — the
 * vault is a git repository (snapshot → diff → revert). So the line is drawn
 * honestly: this function is named `applyAllOrNothing`, not `applyAtomically`.
 *
 * If the rollback itself fails (an I/O failure in its own right) it is **not
 * hidden** — the error lists which file was left in which state. Saying "I do not
 * know" beats saying "it is fine".
 *
 * @param {Array<{op:'write'|'delete', path:string, content?:string}>} plan
 * @returns {{applied:number}}
 */
/**
 * Writes one file **without a torn state**: write to a temp file, flush it to
 * disk, then rename.
 *
 * **Why** (review 2026-08-16): it used to be a bare `writeFileSync`, which
 * **truncates the original first** and then writes. A process death or a full
 * disk in between leaves the user's markdown **truncated** — and that file is in
 * the folder we just asked them to open.
 *
 * ⚠️ This repository **already had** a safe write (`writeTextAtomically` in
 * `cli/src/lib/agent-config.mjs`), used only for `.mcp.json` and `config.toml` —
 * i.e. **protecting the config files and not the user's data**.
 *
 * A rename is atomic within one filesystem, so a death at any moment leaves the
 * file holding **either the old contents or the new**, never half.
 */
function existingRegularFileMode(filePath) {
  try {
    const metadata = statSync(filePath);
    return metadata.isFile() ? metadata.mode & 0o777 : null;
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

function fileMatchesExpectedRaw(filePath, expectedRaw) {
  if (expectedRaw === undefined) return true;
  try {
    return readFileSync(filePath, 'utf-8') === expectedRaw;
  } catch {
    return false;
  }
}

function entryChangedOnDisk(entry) {
  if (entry.expectedAbsent === true) return existsSync(entry.path);
  if (entry.expectedRaw !== undefined && !fileMatchesExpectedRaw(entry.path, entry.expectedRaw)) {
    return true;
  }
  if (entry.expectedMtime === null || entry.expectedMtime === undefined) return false;
  const current = getFileMtime(entry.path);
  return current === null || Math.abs(current - entry.expectedMtime) >= 1;
}

function changedOnDiskError(paths) {
  return new Error(
    `Refused before writing anything: ${paths.length} file(s) changed on disk or were deleted since they `
      + `were read, so this operation would overwrite someone else's edit:\n  `
      + `${paths.join('\n  ')}\n`
      + 'The vault is unchanged. Re-read those documents and run this again.',
  );
}

export function writeFileAtomically(filePath, text, options = {}) {
  const temporaryPath = `${filePath}.oatlas-tmp-${process.pid}`;
  const existingMode = existingRegularFileMode(filePath);
  let descriptor = null;
  try {
    descriptor = openSync(temporaryPath, 'wx');
    // Applied before the contents so the temp file never widens a private original's mode, even briefly.
    if (existingMode !== null) fchmodSync(descriptor, existingMode);
    writeFileSync(descriptor, text, 'utf-8');
  // Flush to disk before the rename — otherwise power can be lost with the new
  // name in place and the contents still in cache.
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = null;
    options.beforeCommit?.();
    if (entryChangedOnDisk({
      path: filePath,
      expectedRaw: options.expectedRaw,
      expectedAbsent: options.expectedAbsent,
    })) {
      if (options.conflictSlug) {
        throw new VaultConflictError(
          options.conflictSlug,
          options.expectedMtime,
          getFileMtime(filePath),
        );
      }
      throw changedOnDiskError([filePath]);
    }
    renameSync(temporaryPath, filePath);
  } finally {
    if (descriptor !== null) {
      try {
        closeSync(descriptor);
      } catch {
        /* already closed */
      }
    }
    try {
      // On success the rename took it, so there is nothing to remove. A temp file
      // remains only on failure, and clearing it never touches the original.
      if (existsSync(temporaryPath)) unlinkSync(temporaryPath);
    } catch {
      /* even if it cannot be cleared, the original is intact */
    }
  }
}

/**
 * The key for comparing whether two paths **name the same file**.
 *
 * For an existing file it is the real path (symlinks resolved); for one that does
 * not exist yet, the path string. Lowercased for case-insensitive filesystems
 * (macOS by default, Windows) — on a case-sensitive one, two genuinely different
 * files then share a key, but the cost of that is one skipped delete, which always
 * beats losing data.
 */
function sameFileKey(path) {
  try {
    if (existsSync(path)) return realpathSync(path).toLowerCase();
  } catch {
    /* if the real path cannot be resolved, fall back to the string — better than no verdict */
  }
  return resolve(path).toLowerCase();
}

/** Nearest existing parent of a write target that does not exist yet. The pre-check never creates anything. */
function nearestExistingParent(path) {
  let probe = dirname(path);
  for (;;) {
    if (existsSync(probe)) return probe;
    const parent = dirname(probe);
    if (parent === probe) return probe;
    probe = parent;
  }
}

/**
 * Creates parent directories one level at a time, and only during the real apply.
 *
 * `recursive:true` can make us mistake a directory another process created in a
 * race for one of ours. Splitting on EEXIST per level means rollback knows exactly
 * what it owns.
 */
function createMissingParents(path, createdDirectories) {
  const missing = [];
  let probe = dirname(path);
  while (!existsSync(probe)) {
    missing.push(probe);
    const parent = dirname(probe);
    if (parent === probe) break;
    probe = parent;
  }
  for (const dir of missing.reverse()) {
    try {
      mkdirSync(dir);
      createdDirectories.push(dir);
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
    }
  }
}

export function applyAllOrNothing(plan, options = {}) {
  if (!Array.isArray(plan) || plan.length === 0) return { applied: 0 };

  /*
   * ⓪ **A plan that writes and then deletes the same file drops the delete.**
   *
   * A rename differing only in case produces exactly this plan:
   *   write `capabilities/auth.md` · delete `capabilities/Auth.md`
   * and the macOS and Windows filesystems treat those as the **same file**, so
   * deleting after writing deletes what was just written — the node disappears
   * entirely and the tool reports success (reproduced in the 2026-08-16 review).
   *
   * The front door (`rename_concept`) rejects that case, but three tools build
   * this plan (rename, merge, reclassify), so the **write layer** blocks it too.
   * What a string comparison cannot catch is caught here by **real path**.
   */
  const writeTargets = new Set();
  for (const entry of plan) {
    if (entry.op !== 'write') continue;
    writeTargets.add(sameFileKey(entry.path));
  }
  const safePlan = plan.filter(
    (entry) => entry.op !== 'delete' || !writeTargets.has(sameFileKey(entry.path)),
  );
  if (safePlan.length !== plan.length) plan = safePlan;

  if (options.requireRevisions === true) {
    const missingRevisions = plan
      .filter((entry) => {
        if (existsSync(entry.path)) return entry.expectedRaw === undefined;
        if (entry.op === 'write') return entry.expectedAbsent !== true;
        return entry.expectedRaw === undefined;
      })
      .map((entry) => entry.path);
    if (missingRevisions.length > 0) {
      throw new Error(
        `Refused before writing anything: ${missingRevisions.length} plan item(s) are missing snapshot revision data:\n  `
          + `${missingRevisions.join('\n  ')}\nThe vault is unchanged. Rebuild the plan from fresh reads.`,
      );
    }
  }

  /*
   * ⓪-b **If someone edited it in the meantime, write nothing at all.**
   *
   * Why (review 2026-08-16): the `expected_mtime` check existed only on the
   * single-file paths. But the three tools using this function (rename, merge,
   * reclassify) rewrite N referencing documents from **a snapshot read minutes
   * earlier**. If the user edited one of them in Obsidian in between, that edit
   * vanished silently — and a human and an agent sharing one folder is the exact
   * situation this product sells, so protection was missing precisely there.
   *
   * When the planner attaches `expectedMtime` to an entry, it is checked here.
   * Without it nothing is checked, as before (zero regression) — but that slot is
   * now "not supplied" rather than "does not exist".
   */
  const conflicts = [];
  for (const entry of plan) {
    if (entryChangedOnDisk(entry)) conflicts.push(entry.path);
  }
  if (conflicts.length > 0) {
    throw changedOnDiskError(conflicts);
  }

  // ① Pre-check, before a single character is written. The common failures
  //    (read-only file, locked file, read-only vault) are caught here, so no
  //    rollback is needed at all.
  const blocked = [];
  for (const entry of plan) {
    const dir = dirname(entry.path);
    try {
      if (existsSync(entry.path)) {
        accessSync(entry.path, fsConstants.W_OK);
      } else if (entry.op === 'write') {
        accessSync(nearestExistingParent(entry.path), fsConstants.W_OK);
      }
      if (entry.op === 'delete' && existsSync(entry.path)) {
        // Deleting a file needs write permission on **the directory**, not on the file.
        accessSync(dir, fsConstants.W_OK);
      }
    } catch (error) {
      blocked.push(`${entry.path} (${error?.code ?? 'EACCES'})`);
    }
  }
  if (blocked.length > 0) {
    throw new Error(
      `Refused before writing anything: ${blocked.length} file(s) are not writable, `
        + `so this operation could not finish as one unit:\n  ${blocked.join('\n  ')}\n`
        + 'The vault is unchanged. Fix permissions (or close the editor/sync client '
        + 'holding them) and re-run with confirm: true.',
    );
  }

  // ② Apply, carrying each entry's **prior state** — the material for a rollback.
  const done = [];
  const createdDirectories = [];
  try {
    for (let index = 0; index < plan.length; index += 1) {
      const entry = plan[index];
      options.beforeApplyEntry?.(index, entry);
      if (entryChangedOnDisk(entry)) throw changedOnDiskError([entry.path]);
      const existed = existsSync(entry.path);
      const before = existed ? readFileSync(entry.path, 'utf-8') : null;
      if (entry.op === 'write') {
        createMissingParents(entry.path, createdDirectories);
        writeFileAtomically(entry.path, entry.content, {
          expectedRaw: existed ? before : undefined,
          expectedAbsent: !existed,
        });
      } else {
        if (existed) {
          if (!fileMatchesExpectedRaw(entry.path, before)) throw changedOnDiskError([entry.path]);
          unlinkSync(entry.path);
        }
      }
      done.push({
        path: entry.path,
        op: entry.op,
        existed,
        before,
        after: entry.op === 'write' ? entry.content : null,
      });
    }
    // A plan that deleted a file invalidates the lazy gate index — the removed
    // slug (or its tail) must stop resolving for the advisory channel.
    if (done.some((step) => step.op === 'delete')) noteGateRemoval();
    return { applied: done.length };
  } catch (error) {
    const unrecovered = [];
    for (const step of done.reverse()) {
      try {
        if (step.op === 'write') {
          if (!fileMatchesExpectedRaw(step.path, step.after)) {
            unrecovered.push(step.path);
            continue;
          }
          if (step.existed) {
            writeFileAtomically(step.path, step.before, { expectedRaw: step.after });
          } else if (existsSync(step.path)) {
            unlinkSync(step.path);
          }
        } else if (step.existed) {
          if (existsSync(step.path)) {
            unrecovered.push(step.path);
            continue;
          }
          writeFileAtomically(step.path, step.before, { expectedAbsent: true });
        }
      } catch {
        unrecovered.push(step.path);
      }
    }
    for (const dir of createdDirectories.reverse()) {
      try {
        rmdirSync(dir);
      } catch (rollbackError) {
        if (rollbackError?.code !== 'ENOENT') unrecovered.push(dir);
      }
    }
    const reason = error?.message ?? String(error);
    if (unrecovered.length > 0) {
      throw new Error(
        `Write failed (${reason}) and the rollback could not finish. `
          + `The vault is INCONSISTENT: these files still hold rewritten content:\n  `
          + `${unrecovered.join('\n  ')}\n`
          + 'If the vault is a git repository, `git diff` shows exactly what changed '
          + 'and `git checkout -- <path>` restores it.',
      );
    }
    throw new Error(
      `Write failed (${reason}). Every change was rolled back: the vault is unchanged.`,
    );
  }
}

/**
 * Rewrites every frontmatter array key and body link that points at `targetSlug`
 * to `nextSlug`. The core operation behind rename_concept and merge_concepts.
 *
 * Matching policy (same as findBacklinks):
 *  - absolute slug (`capabilities/mcp-server`)
 *  - last segment (`mcp-server`) — the replacement uses `nextSlug`'s tail rather
 *    than keeping the target tail, so a rename shows the new name consistently
 *    whichever form the slug was written in
 *  - trailing match (`…/mcp-server`) follows the same policy
 *
 * Body replacement covers `[[targetSlug]]` and `(targetSlug.md)`.
 *
 * `options.dryRun = true` previews without writing to disk.
 * `options.excludeSlugs` lets the caller skip documents it replaces in the same plan.
 *
 * Returns `{ updates: [{ slug, beforeKeys, afterKeys, bodyHit }], totalUpdated }`.
 */
export function redirectBacklinks(rootPath, targetSlug, nextSlug, options = {}) {
  /**
   * With `deferWrite: true` only the plan is built and returned as `plan`; disk is
   * untouched. Different from `dryRun`: a dry run is a preview *for the user*,
   * while this lets **the caller merge its own writes into one plan** and apply
   * them all-or-nothing. `rename_concept` uses it to bind file creation, backlink
   * rewriting, and old-file deletion into one unit.
   */
  const { dryRun = false, deferWrite = false, excludeSlugs = [] } = options;
  const excluded = new Set(Array.isArray(excludeSlugs) ? excludeSlugs : []);
  if (typeof targetSlug !== 'string' || !targetSlug) {
    throw new Error('targetSlug is required.');
  }
  if (typeof nextSlug !== 'string' || !nextSlug) {
    throw new Error('nextSlug is required.');
  }
  if (targetSlug === nextSlug) {
    return { updates: [], totalUpdated: 0, plan: [] };
  }

  const docs = loadVaultDocs(rootPath);
  const targetTail = targetSlug.split('/').pop();
  const nextTail = nextSlug.split('/').pop();
  const tailMatches = docs
    .map((doc) => doc.slug)
    .filter((slug) => slug.split('/').pop() === targetTail);
  // A bare/suffix tail is shorthand only while it uniquely resolves. When
  // capabilities/foo and elements/foo both exist, rewriting "foo" would
  // silently redirect whichever concept the author meant and can even mutate
  // the other node's frontmatter slug. Exact canonical refs remain safe.
  const canRewriteTail = tailMatches.length === 1 && tailMatches[0] === targetSlug;

  function rewriteArrayItem(value) {
    if (typeof value !== 'string') return { value, changed: false };
    if (value === targetSlug) return { value: nextSlug, changed: true };
    if (canRewriteTail && value === targetTail) return { value: nextTail, changed: true };
    if (canRewriteTail && value.endsWith(`/${targetTail}`)) {
      // path-prefixed tail — preserved prefix plus the new tail
      const prefix = value.slice(0, value.length - targetTail.length);
      return { value: `${prefix}${nextTail}`, changed: true };
    }
    return { value, changed: false };
  }

  const updates = [];
  /** The write plan destined for disk: applied in one go once the loop ends. */
  const plan = [];
  for (const doc of docs) {
    if (doc.slug === targetSlug || excluded.has(doc.slug)) continue;
    const filePath = slugToPath(rootPath, doc.slug);
    const nextFm = { ...doc.frontmatter };
    const beforeKeys = [];
    const afterKeys = [];
    let fmChanged = false;
    // When the document being rewritten IS the destination node (merge_concepts
    // scans the surviving doc for refs to the absorbed one), every rewrite would
    // by construction produce a reference to itself. Reproduced (bug sweep
    // 2026-09-01): merging capabilities/b into capabilities/a where a carried
    // `relates: [capabilities/b]` wrote `relates: [capabilities/a]` — a self-loop
    // polluting degree counts, neighbors and path queries. Such refs are dropped
    // instead of rewritten; the removal stays visible in beforeKeys/afterKeys.
    const rewritingSelf = doc.slug === nextSlug;

    for (const key of Object.keys(nextFm)) {
      const value = nextFm[key];
      if (Array.isArray(value)) {
        const before = [...value];
        const rewritten = value.map((v) => rewriteArrayItem(v));
        const after = rewritten
          .filter((r) => !(rewritingSelf && r.changed))
          .map((r) => r.value);
        if (before.length !== after.length || before.some((b, i) => b !== after[i])) {
          // dedup + sort — never append a duplicate when nextSlug is already
          // present, so the same graph state leaves the same frontmatter array.
          const deduped = normalizeRelationRefs(after);
          nextFm[key] = deduped;
          beforeKeys.push({ key, before });
          afterKeys.push({ key, after: deduped });
          fmChanged = true;
        }
      } else if (typeof value === 'string') {
        // Only graph reference slots are rewritten (`domain:` plus the
        // GRAPH_ARRAY_KEYS family). An evidence string such as `path:` is not a
        // reference — measured 2026-08-01 while flattening the dogfood vault: the
        // tail-suffix clause of the rename `elements/src/widgets/docs-vault` →
        // `elements/docs-vault-widget` also rewrote **another node's**
        // `path: src/entities/docs-vault` to `…/docs-vault-widget`, pointing it at
        // a file that does not exist (3 cases of pathDrift).
        const isRefSlot = key === 'domain' || GRAPH_ARRAY_KEY_SET.has(key);
        const r = isRefSlot ? rewriteArrayItem(value) : { changed: false };
        if (r.changed) {
          if (rewritingSelf) {
            delete nextFm[key];
            beforeKeys.push({ key, before: value });
            afterKeys.push({ key, after: null });
          } else {
            nextFm[key] = r.value;
            beforeKeys.push({ key, before: value });
            afterKeys.push({ key, after: r.value });
          }
          fmChanged = true;
        }
      } else if (value && typeof value === 'object') {
        // The KEY of an object map value (`relation_notes: {ref: "why"}`) is a
        // rename target too. Without this, a relation's rationale note is orphaned
        // the moment the rename happens — the red-team finding that blocked the
        // schema from shipping.
        //
        // Key-collision merge policy: when both the old and the new key exist, the
        // existing (new) value wins — a note the user already wrote under the new
        // name is the more recent intent, and letting the rename overwrite it is
        // silent data loss. The displaced old value is not discarded: it stays in
        // beforeKeys, visible in the dry run and the audit.
        const entries = Object.entries(value);
        let mapChanged = false;
        const nextMap = {};
        for (const [mapKey, mapValue] of entries) {
          const r = rewriteArrayItem(mapKey);
          if (!r.changed) {
            if (!(mapKey in nextMap)) nextMap[mapKey] = mapValue;
            continue;
          }
          mapChanged = true;
          // A note whose key would now denote the document itself (merge into
          // this doc) is dropped with the self-ref it annotated.
          if (rewritingSelf) continue;
          if (r.value in nextMap || entries.some(([k]) => k === r.value)) {
            // Collision — the existing (new key) value wins; the old value is only recorded.
            continue;
          }
          nextMap[r.value] = mapValue;
        }
        if (mapChanged) {
          // Preserve the collision winner (the original new key) value
          for (const [mapKey, mapValue] of entries) {
            if (!(mapKey in nextMap) && !rewriteArrayItem(mapKey).changed) nextMap[mapKey] = mapValue;
          }
          beforeKeys.push({ key, before: value });
          afterKeys.push({ key, after: nextMap });
          nextFm[key] = nextMap;
          fmChanged = true;
        }
      }
    }

    let nextBody = doc.body;
    let bodyChanged = false;
    /*
     * Body links carry the same reference in more shapes than the frontmatter
     * arrays do: `[[slug]]`, `[[slug#heading]]`, `[[slug|alias]]`, `(slug.md)`,
     * `(slug.md#anchor)`, and path-prefixed `(…/slug.md)`. Rewriting only the
     * bare forms left alias/anchor links silently dangling after a confirmed
     * rename — and permanently dangling after a merge, which deletes the old
     * file in the same plan. `rewriteArrayItem` already owns the slug/tail
     * matching rules (including the ambiguous-tail guard), so every form routes
     * through it. Bare prose paths outside a link stay untouched: an evidence
     * string is not a reference (see the pathDrift note above).
     */
    nextBody = nextBody.replace(
      /\[\[([^\][|#\r\n]+)((?:#[^\][|\r\n]*)?(?:\|[^\][\r\n]*)?)\]\]/g,
      (whole, target, rest) => {
        const r = rewriteArrayItem(target.trim());
        if (!r.changed) return whole;
        bodyChanged = true;
        return `[[${r.value}${rest}]]`;
      },
    );
    nextBody = nextBody.replace(
      /\(([^()\s]+)\.md(#[^()\s]*)?\)/g,
      (whole, target, anchor) => {
        const r = rewriteArrayItem(target);
        if (!r.changed) return whole;
        bodyChanged = true;
        return `(${r.value}.md${anchor ?? ''})`;
      },
    );

    if (!fmChanged && !bodyChanged) continue;

    updates.push({
      slug: doc.slug,
      title: docTitle(doc),
      beforeKeys,
      afterKeys,
      bodyChanged,
    });

    // **Do not write here.** This line used to be a `writeFileSync`, so a failure
    // on the next file left a half vault with only the earlier ones changed.
    plan.push({
      op: 'write',
      path: filePath,
      content: buildMarkdown({ frontmatter: nextFm, body: nextBody }),
      /*
       * **Carry the read timestamp along** (review 2026-08-16).
       *
       * This document is a snapshot read seconds or minutes ago. If the user
       * edited the file in their own editor in between, writing it as-is here
       * destroys that edit. Compare this value against disk immediately before
       * the write.
       */
      expectedMtime: doc.mtime,
      expectedRaw: doc.raw,
    });
  }

  if (!dryRun && !deferWrite) applyAllOrNothing(plan, { requireRevisions: true });

  return {
    updates,
    totalUpdated: updates.length,
    ...(deferWrite ? { plan } : {}),
  };
}

function docTitle(doc) {
  if (typeof doc?.frontmatter?.title === 'string' && doc.frontmatter.title.trim()) {
    return doc.frontmatter.title;
  }
  if (typeof doc?.frontmatter?.name === 'string' && doc.frontmatter.name.trim()) {
    return doc.frontmatter.name;
  }
  return doc?.slug;
}

function normalizeForDuplicateTitle(title) {
  return String(title ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

/**
 * Returns an advisory warning string when a new node's title matches an existing
 * node's under normalisation (lowercased, whitespace collapsed), else null.
 *
 * The #1 failure mode of a growing vault is **duplicate or hallucinated nodes**.
 * Checking `similar_nodes` before `add_concept` is the correct discipline, but
 * forgetting it lets near-duplicates pile up quietly. This is add_concept's safety
 * net: when the same title already exists, it says "merge with patch_concept". It
 * is advisory and never blocks the write.
 *
 * Precision first — *exact* match after normalisation — to minimise false alarms.
 * Fuzzy or partial matching is excluded because it fires on genuinely different
 * concepts (auth-login vs auth-logout). The node itself (same slug) and empty
 * titles are excluded.
 */
export function detectDuplicateTitle(title, slug, docs) {
  const norm = normalizeForDuplicateTitle(title);
  if (!norm) return null;
  for (const doc of docs ?? []) {
    if (!doc || doc.slug === slug) continue;
    if (normalizeForDuplicateTitle(docTitle(doc)) === norm) {
      const kind = doc.frontmatter?.kind ?? 'unknown';
      return (
        `a node titled "${title}" already exists at "${doc.slug}" (kind: ${kind}): ` +
        `if this is the same concept, patch_concept on "${doc.slug}" instead of adding a duplicate.`
      );
    }
  }
  return null;
}

/**
 * Light check that the vault root looks like a markdown vault. Only an absolute
 * path and a directory are required — a folder with no frontmatter is allowed as
 * an empty vault.
 */
export function ensureVaultRoot(rootPath) {
  if (!rootPath) {
    throw new Error('Set the vault root via OATLAS_VAULT env var or --vault arg.');
  }
  if (!existsSync(rootPath)) {
    throw new Error(`Vault root not found: ${rootPath}`);
  }
  if (!statSync(rootPath).isDirectory()) {
    throw new Error(`Vault root is not a directory: ${rootPath}`);
  }
}
