// Vault directory walking and `.md` read/write. Synchronous fs only: MCP tool
// calls are infrequent, so async buys nothing.

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
import { previewDocumentPatch } from './document-patch.mjs';
import {
  CONTAINMENT_KEY_FOR_KIND,
  NODE_ELIGIBILITY_GATE,
  REVIEW_NOTE_KEY,
  REVIEW_STATE_HUMAN_DECIDES,
  REVIEW_STATE_KEY,
  containmentKeyFor,
  flatSlugIssue,
  folderForKind,
  generateNodeUid,
  inspectMergedUids,
  nodeUidIssue,
} from './schema.mjs';
import {
  STARTER_EXAMPLE_SLUGS,
  bulkProvenanceMessage,
  capabilityWithoutEvidenceMessage,
  danglingGraphReferenceMessage,
  denseParentActionMessage,
  looksLikeEvidencePath,
  looksLikePath,
  pathShapedReferenceMessage,
  pathShapedTitleMessage,
  slugOutsideKindFolderMessage,
} from './construction-rules.mjs';
import { hasCapabilityImplementationEvidence } from './capability-evidence.mjs';
import {
  dependencyWitnessFinding,
  isStarterExampleNode,
  meaningFindings,
  starterExampleFinding,
} from './meaning-findings.mjs';

/**
 * Thrown when a write passed `expectedMtime` and the file changed on disk since
 * that read (a GUI, an outside editor or another agent). Omitting the option
 * skips the check. mtime is integer ms; 1s-granularity filesystems suffice.
 */
export class VaultConflictError extends Error {
  constructor(slug, expectedMtime, currentMtime) {
    super(
      `Vault conflict: "${slug}" was modified externally (changed on disk) between read and write. ` +
        `expectedMtime=${expectedMtime} currentMtime=${currentMtime}. ` +
        // Name only a recovery that works: seven of the eight write tools that raise
        // this do not accept `force`, and delete_concept's `force` means "despite
        // backlinks", not "ignore mtime".
        `Re-read the doc with get_concept to get the current expected_mtime, then retry the write.`,
    );
    this.name = 'VaultConflictError';
    this.code = 'VAULT_CONFLICT';
    this.slug = slug;
    this.expectedMtime = expectedMtime;
    this.currentMtime = currentMtime;
  }
}

/** File mtime in ms, or null when absent; capture it right after a read to pass as `expectedMtime`. */
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
 * The frontmatter array keys read as graph edges. findOrphans, findPath and the
 * rest share this one list; a private copy is how they drifted before.
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

/** Same edge set, same bytes on disk, whatever order the agent wrote them in. */
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
 * The `relation_notes: { <ref>: "why" }` sentence a document stores for one
 * relation. The raw ref is tried before the resolved slug, the compiler's order
 * for `edge.rationale`. `undefined` when absent: callers omit the key, since an
 * absent rationale is no claim, not a null one.
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
 * Documents that name `ref` in a relation key. A concept named only in another
 * document's relations has no file, yet the map shows it; this lets get_concept
 * answer "who wrote this name, under which key" instead of "Doc not found".
 * It creates no nodes.
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
 * The first prose paragraph of a body, so get_concept previews the sentence a
 * person wrote rather than table or code syntax. Skips blank lines, headings,
 * code, tables, images, rules, lists and quotes; falls back to the raw body when
 * no prose exists; caps at `maxLen` with a trailing '…'.
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
 * Reports how much body was returned and what was withheld. The construction
 * rules put evidence and boundaries in the body, so a silent cut hides what an
 * agent must read. When cut: `truncated: true`, `omittedChars`, and a `hint`
 * naming the call that fetches the rest; an intact response carries no `hint`.
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

/** Absolute paths of every `.md` under the vault root, skipping dotfiles and node_modules. */
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
 * File path → vault-relative slug (`projects/foo.md` → `projects/foo`), NFC
 * normalised: macOS often hands back Korean filenames as NFD while frontmatter
 * is typed as NFC, and the byte mismatch drops those nodes' relations. Only the
 * identifier is normalised; the disk path stays as it is.
 */
export function pathToSlug(rootPath, filePath) {
  const rel = relative(rootPath, filePath).replace(/\\/g, '/');
  return rel.replace(/\.md$/, '').normalize('NFC');
}

/**
 * vault-relative slug → file path. Security: a slug from an agent or a prompt
 * injection (`../../etc/passwd`) must not name a file outside the vault root, so
 * this throws on escape, and every read and write caller fails with it.
 */
export function slugToPath(rootPath, slug) {
  if (typeof slug !== 'string' || slug.length === 0) {
    throw new Error('slug must be a non-empty string');
  }
  // Some Node fs APIs truncate at a null byte.
  if (slug.includes('\0')) {
    throw new Error('slug must not contain a null byte');
  }
  const candidate = resolve(rootPath, `${slug}.md`);
  const normalizedRoot = resolve(rootPath);
  if (
    candidate !== normalizedRoot &&
    !candidate.startsWith(normalizedRoot + sep)
  ) {
    throw new Error(`slug points outside the vault root: "${slug}"`);
  }
  // The string check cannot stop a symlink: `escape.md` inside the vault may
  // link outside it, and writeFileSync follows the link. Existing paths are
  // realpath'd; a new file's parent is checked below.
  assertRealPathInside(candidate, normalizedRoot, slug);
  return candidate;
}

/**
 * The real path (symlinks resolved) must stay inside the vault. A file that does
 * not exist yet uses its nearest existing ancestor, since creating a file inside
 * a linked directory is the same escape.
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
      if (parent === probe) return;
      probe = parent;
    }
  }
}

/**
 * The exact on-disk spelling of an existing slug, or `null`. `existsSync`
 * follows the filesystem's case rules, so on macOS a wrong-case slug passes every
 * existence gate while backlink matching is case-sensitive: rename_concept would
 * redirect 0 backlinks and report success. Destructive tools use the disk's
 * spelling. Walks one directory level per segment (exact entry, then a unique
 * case-insensitive one); an unmatched segment returns the input unchanged.
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

/**
 * Whether a `.md` for the slug exists, so a typo or invented slug is not
 * appended to a frontmatter array as a dangling reference. A malformed slug
 * returns false instead of throwing; a genuine fs error surfaces on the next read.
 */
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

/** Reads one `.md`; its `mtime` passed as a later `expectedMtime` enables conflict detection. */
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

/** Every doc in the vault; the caller filters. */
export function loadVaultDocs(rootPath) {
  const files = walkMd(rootPath);
  return files.map((path) => readDoc(rootPath, path));
}

/**
 * Up to `limit` existing slugs similar to `badSlug`, for a not-found error's
 * next action. First stage that hits wins: exact tail, tail substring either
 * way, tail prefix. Substring only: an edit distance is costly on a large vault
 * and noisy, and the goal is "these exist", not "did you mean".
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

/** Suffix a not-found or duplicate error appends so the agent can act next. */
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

/*
 * Node-eligibility gate (`docs/DECISIONS.md`). Values live in `schema.mjs` and
 * wording in `construction-rules.mjs`; the judgement lives here, in `commitDoc`,
 * because all three write doors (add_concept, patch_concept, add_relation) meet
 * here. It never blocks a write and never enforces a child count: a rejection
 * strands an agent mid-batch, and a cap is met with empty filler buckets.
 */

/**
 * Session memory the compiled vault cannot have: how often a node was already
 * mentioned, and what this run created (a static scan cannot tell a person's
 * week of nodes from one batch).
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
   * parent slug → child refs this session's writes added to its graph arrays: a
   * parent's own list growing (`patch_concept` on `elements:`), the direction the
   * other provenance map cannot see.
   */
  parentGrewBy: new Map(),
  /** Lazy slug index: { rootPath, names: Set<string> }. */
  index: null,
  /**
   * Repository root the meaning findings resolve a cited `path:` against,
   * or `null` while nothing grounded it. Set through a setter
   * because `server/runtime.mjs` imports this module (an import would be a cycle); `null`
   * keeps the check silent instead of measuring against the process cwd.
   */
  repoRoot: null,
};

/**
 * Called once at module load by the door that owns add_concept, add_concepts and
 * patch_concept, the only writes that set `path:`. `null` keeps the
 * folder-only check silent.
 */
export function configureNodeEligibilityRepoRoot(repoRoot) {
  GATE.repoRoot = typeof repoRoot === 'string' && repoRoot.trim() ? repoRoot : null;
}

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
 * Takes and clears the findings since the last drain: each tool response carries
 * them once, and a finding delivered twice is one the reader starts filtering.
 */
export function drainNodeEligibilityFindings() {
  const findings = GATE.findings;
  GATE.findings = [];
  return findings;
}

/**
 * Every name the vault answers to (slugs, tails, frontmatter `slug:` aliases),
 * the same three the MCP resolver accepts, so the gate never calls "unresolved"
 * what get_concept would return.
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
 * The index can only be stale toward "missing" (a doc written by someone else
 * since the build), so a miss triggers one rebuild and a re-check before it is
 * trusted.
 */
function gateResolves(rootPath, ref) {
  const name = String(ref).normalize('NFC');
  if (gateIndex(rootPath).names.has(name)) return true;
  return gateIndex(rootPath, { rebuild: true }).names.has(name);
}

/**
 * The `path:` the node at the other end of an edge cites, read through the
 * existing helpers. `null` whenever the answer would be a guess (missing,
 * unreadable, no `path:`); the caller stays silent on `null`.
 */
function gateTargetPath(rootPath, ref) {
  const name = String(ref ?? '').trim();
  if (!name) return null;
  try {
    const filePath = slugToPath(rootPath, name);
    if (!existsSync(filePath)) return null;
    const path = readDoc(rootPath, filePath).frontmatter?.path;
    return typeof path === 'string' && path.trim() ? path.trim() : null;
  } catch {
    return null;
  }
}

/**
 * The `init` starter example for one kind, if still present: one existsSync and
 * at most one readDoc at its known address. A renamed starter is the finished
 * state; the whole-vault pass covers a copy under another name.
 */
function gateStarterExample(rootPath, kind) {
  const starterSlug = STARTER_EXAMPLE_SLUGS[kind];
  if (!starterSlug) return null;
  try {
    const filePath = slugToPath(rootPath, starterSlug);
    if (!existsSync(filePath)) return null;
    const doc = readDoc(rootPath, filePath);
    const docKind = typeof doc.frontmatter?.kind === 'string' ? doc.frontmatter.kind.trim() : '';
    if (docKind !== kind) return null;
    return { slug: starterSlug, kind, title: doc.frontmatter?.title, body: doc.body };
  } catch {
    return null;
  }
}

/** Keep the cache warm across a batch instead of rebuilding on every row. */
function noteGateWrite(rootPath, slug) {
  if (!GATE.index || GATE.index.rootPath !== rootPath) return;
  GATE.index.names.add(slug);
  const tail = slug.split('/').pop();
  if (tail) GATE.index.names.add(tail);
}
/**
 * Drops the gate index after a removal: another slug may still provide the same
 * tail, so only a rebuild is safe. Otherwise gateResolves keeps answering true
 * for a removed slug and silences the dangling-reference advisory.
 */
function noteGateRemoval() {
  GATE.index = null;
}

/**
 * Speaks on the first crossing, then only on each new multiple: a channel that
 * repeats on every write becomes invisible.
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
 * Which containment array makes a node a parent, per kind. No `project → domain`
 * entry: a vault has a handful of projects, too few for a percentile.
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
 * What counts as "wide" for this kind of parent, and whether the number is the
 * vault's own p90 (enough parents) or the researched starting range; a bootstrap
 * constant must not be reported as the reader's own measurement. Costs a full
 * scan, so call it only once a parent is already worth a sentence.
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
 * Did a machine fill this parent this session? `createdUnderParent` sees children
 * each declaring `domain:`; `parentGrewBy` sees the parent's own array grow.
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
 * Runs on the committed frontmatter after the file is on disk: it observes and
 * never blocks. `created` marks a brand-new node; `previousFrontmatter` is what
 * this write replaced, which tells a new edge from one already on disk.
 *
 * @param {string} rootPath
 * @param {string} slug
 * @param {Record<string, unknown>} frontmatter
 * @param {{ created?: boolean }} [options]
 */
function runNodeEligibilityGate(
  rootPath,
  slug,
  frontmatter,
  {
    created = false,
    body = '',
    bodyWritten = false,
    pathWritten = false,
    previousFrontmatter,
  } = {},
) {
  if (!frontmatter || typeof frontmatter !== 'object') return;

  // ⓪ A capability born with no evidence. Creation only: "name the behaviour,
  //    then attach the file" is the honest order, and `maintenance_plan` carries
  //    the durable question.
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

  // ⓪b A node written outside its kind folder. Creation only, since a slug is
  //     minted once and a patch cannot undo it. Advisory: a flat slug is valid;
  //     `flatSlugIssue` in writeDoc rejects the shape that merges distinct nodes.
  if (created && typeof frontmatter.kind === 'string') {
    const folder = folderForKind(frontmatter.kind.trim());
    if (folder && !slug.startsWith(folder)) {
      GATE.findings.push({
        code: 'slug-outside-kind-folder',
        slug,
        key: 'slug',
        refs: [`${folder}${slug}`],
        count: 1,
        message: slugOutsideKindFolderMessage({
          slug,
          kind: frontmatter.kind.trim(),
          canonicalSlug: `${folder}${slug}`,
        }),
      });
    }
  }

  // ① A path in the title slot: an element names a role, not a location.
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

  // ② Reference resolution. validate_vault exempts path-shaped `elements:`
  //    entries; here nothing is exempt, and the path shape only picks the repair
  //    named first.
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

  // ③ Dense parent. Fires only when something else is already wrong (mostly
  //    broken references, or machine-filled this session), so a healthy wide
  //    parent stays silent and never pays for the percentile scan. Unresolved
  //    strings are not counted as children, or the defect would read as growth.
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

  // ④ Meaning gaps in the body. `meaning-findings.mjs` owns the logic and
  //    `construction-rules.mjs` the sentences; this is the wiring. Gated on what
  //    the write touched, so an unrelated patch does not repeat the accusation.
  for (const finding of meaningFindings({
    kind: frontmatter.kind,
    slug,
    frontmatter,
    body,
    repoRoot: GATE.repoRoot,
    bodyWritten: created || bodyWritten,
    pathWritten: created || pathWritten,
  })) {
    if (!shouldNotice(GATE.noticed, `${slug}\0${finding.code}\0${finding.key}`, finding.count ?? 1, {
      threshold: NOTICE_THRESHOLD,
      multiple: NOTICE_REPEAT_MULTIPLE,
    })) {
      continue;
    }
    GATE.findings.push(finding);
  }

  // ④b A dependency the source file never mentions: opens the file this node
  //     cites and asks whether it names the file the target cites. New edges only
  //     (hence `previousFrontmatter`), keyed by target so two edges are two
  //     sentences. No compiled-plan half: it needs the repository root, which only
  //     the write door and the validators hold.
  for (const finding of dependencyWitnessFinding({
    slug,
    frontmatter,
    previousFrontmatter,
    repoRoot: GATE.repoRoot,
    resolveTargetPath: (ref) => gateTargetPath(rootPath, ref),
  })) {
    if (!shouldNotice(GATE.noticed, `${slug}\0${finding.code}\0${finding.key}`, finding.count ?? 1, {
      threshold: NOTICE_THRESHOLD,
      multiple: NOTICE_REPEAT_MULTIPLE,
    })) {
      continue;
    }
    GATE.findings.push(finding);
  }

  // ④c An `init` starter example once a real node of its kind lands: from then
  //     it is a fake concept on the map. Creation only, for non-starter nodes. The
  //     finding is attached to the starter (the file to act on), matching the
  //     vault-wide row so the queue drops the duplicate; once per starter per session.
  if (created && typeof frontmatter.kind === 'string') {
    const kind = frontmatter.kind.trim();
    const title = frontmatter.title;
    if (!isStarterExampleNode({ slug, kind, title })) {
      const starter = gateStarterExample(rootPath, kind);
      if (starter && shouldNotice(GATE.noticed, `${starter.slug}\0starter-example-node`, 1, {
        threshold: NOTICE_THRESHOLD,
        multiple: NOTICE_REPEAT_MULTIPLE,
      })) {
        const finding = starterExampleFinding({ ...starter, realSlug: slug });
        if (finding) GATE.findings.push(finding);
      }
    }
  }

  // ⑤ Bulk provenance: who made these and when, which only the write path knows.
  //    Not a size limit.
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
 * The single write point: writeDoc, patchFrontmatter and updateDoc serialize
 * here, so every door inherits the gate. `write-path-gate.test.mjs` fails if a
 * door writes bytes elsewhere.
 */
function commitDoc(
  rootPath,
  slug,
  filePath,
  frontmatter,
  body,
  {
    created = false,
    bodyWritten = false,
    pathWritten = false,
    previousFrontmatter,
    expectedRaw,
    expectedMtime,
    beforeCommit,
    serializedMarkdown,
  } = {},
) {
  writeFileAtomically(filePath, serializedMarkdown ?? buildMarkdown({ frontmatter, body }), {
    expectedRaw,
    expectedAbsent: created,
    conflictSlug: created ? undefined : slug,
    expectedMtime,
    beforeCommit,
  });
  if (created) noteGateWrite(rootPath, slug);
  noteParentGrowth(slug, previousFrontmatter, frontmatter);
  runNodeEligibilityGate(rootPath, slug, frontmatter, { created, body, bodyWritten, pathWritten, previousFrontmatter });
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
 * A node written by hand (Obsidian, vim, the GitHub editor) has no `uid:`. That
 * is legitimate input, but left alone the compile stops on an identity error and
 * every graph command on the vault fails.
 */
function hasSettledUid(frontmatter) {
  return typeof frontmatter?.uid === 'string' && frontmatter.uid.trim() !== '';
}

/**
 * Immutability covers changing a present uid only; filling an absent one is
 * allowed, or a hand-written node has no repair door (patch, set uid and add
 * all refuse). Taking over another node's identity is still blocked by the
 * collision check in `assertNodeIdentity`.
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
 * The first write to a node without identity mints it (writer-minted UUIDv4).
 * The minted value rides the return so the caller tells the person.
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
 * Records which child refs this write added to a parent's graph arrays: on disk,
 * a child a person added over a week and one a loop appended look identical.
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

/** Writes a new doc, creating directories; throws if it exists, so an overwrite is always explicit. */
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
  // Slug flatness is shape validity, so a hard error; the gate's "never block"
  // covers judgements of meaning only.
  const slugIssue = flatSlugIssue(frontmatter?.kind, slug);
  if (slugIssue) throw new Error(slugIssue);
  assertNodeIdentity(rootPath, slug, frontmatter);
  mkdirSync(dirname(filePath), { recursive: true });
  return commitDoc(rootPath, slug, filePath, frontmatter, body, { created: true });
}


/**
 * Deletes a doc; confirmation and backlink checks are the caller's. Returns the
 * state read just before the delete, throws when absent, honours `expectedMtime`.
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
 * Patches only the frontmatter, keeping the body: `null` deletes a
 * key, `undefined` skips it. `mintedUid` is set only when this write minted the
 * identity, and the caller must tell the person.
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
    pathWritten: Object.hasOwn(patch, 'path'),
    previousFrontmatter: frontmatter,
    expectedRaw: doc.raw,
    expectedMtime: doc.mtime,
    beforeCommit: options.beforeCommit,
  });
  return { filePath, frontmatter: next, mintedUid };
}

/**
 * Updates frontmatter and body together, with patchFrontmatter's patch semantics
 * and return shape; a string `body` replaces, `undefined` keeps.
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
  const { frontmatter } = doc;
  assertIdentityPatch(frontmatter, patch);
  if (body !== undefined && typeof body !== 'string') {
    throw new Error('body must be a string.');
  }
  const identityDraft = { ...frontmatter };
  for (const [key, value] of Object.entries(patch ?? {})) {
    if (value === null) delete identityDraft[key];
    else if (value !== undefined) identityDraft[key] = value;
  }
  const mintedUid = fillMissingUid(frontmatter, identityDraft);
  const preview = previewDocumentPatch({ rawBefore: doc.raw, frontmatterPatch: patch, body, ...(mintedUid ? { mintedUid } : {}) });
  if (preview.status !== 'available') throw new Error('The writer could not resolve the document identity required for this patch.');
  assertNodeIdentity(rootPath, slug, preview.frontmatter);
  commitDoc(rootPath, slug, filePath, preview.frontmatter, preview.body, {
    bodyWritten: body !== undefined,
    pathWritten: Boolean(patch) && Object.hasOwn(patch, 'path'),
    previousFrontmatter: frontmatter,
    expectedRaw: doc.raw,
    expectedMtime: doc.mtime,
    beforeCommit,
    serializedMarkdown: preview.markdown,
  });
  return { filePath, frontmatter: preview.frontmatter, mintedUid };
}

/** Node count per kind plus the total, for inventory questions in one pass. */
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
  // Concepts named only in a relation key. The map and insights count them, so
  // without this number `total` reads as if the screen inflated it; they have no
  // kind, so they stay out of the per-kind inventory.
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
 * Docs no other node points at from a frontmatter graph key, matched like
 * findBacklinks. `excludeKinds` defaults to ['project', 'vault-readme'].
 */
export function findOrphans(rootPath, options = {}) {
  const docs = loadVaultDocs(rootPath);
  const kindFilter = typeof options.kind === 'string' ? options.kind : null;
  const excludeKinds = new Set(
    Array.isArray(options.excludeKinds)
      ? options.excludeKinds
      : ['project', 'vault-readme'],
  );
  // An ambiguous ref counts as a reference to every candidate, so no document a
  // vault plainly names is reported as an orphan.
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
      // Same row shape as list_concepts and find_backlinks, so an agent can filter
      // orphans without a follow-up get_concept.
      domain: doc.frontmatter.domain,
      mtime: doc.mtime,
    });
  }
  return { total: orphans.length, orphans };
}

/**
 * Shortest undirected path between two slugs over the graph keys and their
 * backlinks, by BFS. Endpoints match an absolute slug or its last segment. null
 * when there is no path within `maxHops` (default 5).
 */
export function findPath(rootPath, fromSlug, toSlug, maxHops = 5) {
  assertBoundedNonNegativeInteger(maxHops, 'maxHops', { max: 20 });
  const docs = loadVaultDocs(rootPath);
  // Tail and frontmatter slug are aliases of one node. An ambiguous ref resolves
  // to null, so no path is routed through an arbitrary match.
  const resolveRef = buildRefIndex(docs).resolve;
  const resolvedFrom = resolveRef(fromSlug);
  const resolvedTo = resolveRef(toSlug);
  // Both endpoints must exist, so a fabricated slug never gets a trivial path.
  if (!resolvedFrom || !resolvedTo) return null;
  if (resolvedFrom === resolvedTo) return { from: fromSlug, to: toSlug, hops: [resolvedFrom], edges: [] };
  // Undirected adjacency: node → Map(neighbour → { via, rationale? }). The first
  // key naming a neighbour wins, and NEIGHBOR_KEYS runs most to least specific.
  // The source document's `relation_notes` rationale rides in both directions.
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
  // BFS: queue of { node, depth } with a head index (no Array.shift), O(V + E).
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
        // Push then reverse once, O(D). edges[i] carries the `via` key between hops i
        // and i+1, plus the declaring document's `rationale` when it has one.
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

/** Docs pointing at `targetSlug` through a frontmatter graph key or a body wikilink or markdown link. */
export function findBacklinks(rootPath, targetSlug, options = {}) {
  // `includeAmbiguousTailRefs` adds rows whose ambiguous ref could mean the
  // target, marked `ambiguousTail: true`. The default stays exact-only, but
  // delete_concept opts in, or a node referenced only by an ambiguous tail would
  // be deleted without force or warning.
  const includeAmbiguous = options.includeAmbiguousTailRefs === true;
  const docs = loadVaultDocs(rootPath);
  const { resolve: resolveRef, resolveCandidates } = buildRefIndex(docs);
  const resolvedTarget = resolveRef(targetSlug) || targetSlug;
  const matches = [];
  // collectNeighborRefs reads legacy keys (`depends_on`) as canonical edges and
  // resolves a frontmatter slug alias to the same node.
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
    // Alias (`[[x|label]]`) and heading (`[[x#h]]`) wikilinks count too, because
    // redirectBacklinks rewrites them.
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
      // Same fields as list_concepts, so an agent handles both views alike.
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
 * The one reference index findPath, findOrphans and findBacklinks share. An
 * ambiguous ref asserts no specific edge (`resolve` → null) but is a candidate
 * referrer of every match (`resolveCandidates`), so "is this referenced?" stays
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

/**
 * Writes one file without a torn state: temp file, fsync, rename. A rename is
 * atomic within one filesystem, so a crash leaves either the old contents or the
 * new, never a truncated user file.
 */
export function writeFileAtomically(filePath, text, options = {}) {
  const temporaryPath = `${filePath}.oatlas-tmp-${process.pid}`;
  const existingMode = existingRegularFileMode(filePath);
  let descriptor = null;
  try {
    descriptor = openSync(temporaryPath, 'wx');
    // Before the contents, so the temp file never widens a private original's mode.
    if (existingMode !== null) fchmodSync(descriptor, existingMode);
    writeFileSync(descriptor, text, 'utf-8');
  // Flush before the rename, or power loss can leave the new name with the
  // contents still in cache.
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
      // Only a failed write leaves the temp file; removing it never touches the original.
      if (existsSync(temporaryPath)) unlinkSync(temporaryPath);
    } catch {
      /* even if it cannot be cleared, the original is intact */
    }
  }
}

/**
 * Key for "do these paths name the same file": the real path when it exists,
 * else the string, lowercased for case-insensitive filesystems. On a
 * case-sensitive one, a false match costs one skipped delete, never data.
 */
function sameFileKey(path) {
  try {
    if (existsSync(path)) return realpathSync(path).toLowerCase();
  } catch {
    /* unresolvable real path: the string is still a verdict */
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
 * Creates parents one level at a time, only during the real apply: a per-level
 * EEXIST tells a directory another process raced in from one we own, so
 * rollback removes only ours.
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

/**
 * The refusal sentence when the file carries `review_state: human_decides`, or
 * null when absent, unparseable or unreserved: a created file steps on no
 * reservation, and an unreadable one must not invent one.
 */
function reservedForHumanIssue(filePath) {
  if (typeof filePath !== 'string' || !existsSync(filePath)) return null;
  let frontmatter;
  try {
    frontmatter = parseFrontmatter(readFileSync(filePath, 'utf8')).frontmatter ?? {};
  } catch {
    return null;
  }
  if (frontmatter[REVIEW_STATE_KEY] !== REVIEW_STATE_HUMAN_DECIDES) return null;
  const note = frontmatter[REVIEW_NOTE_KEY];
  const slug = typeof frontmatter.slug === 'string' ? frontmatter.slug : filePath;
  return (
    `Refused: ${slug} carries ${REVIEW_STATE_KEY}: ${REVIEW_STATE_HUMAN_DECIDES}, so it is reserved for a person` +
    ' and this change would rewrite it.' +
    (note ? ` What they have to decide: ${note}` : '') +
    ' Report it and let the person decide; only they release the reservation.'
  );
}

/**
 * Applies a multi-file vault write all-or-nothing. While the process lives, any
 * I/O failure (EACCES, EROFS, ENOSPC, a lock) leaves the vault as it started:
 * every target's permission is pre-checked, and a later failure restores the
 * original bytes. Not crash-safe (that needs a journal; the vault is a git
 * repository), hence not "atomic". A failed rollback is reported file by file.
 *
 * @param {Array<{op:'write'|'delete', path:string, content?:string}>} plan
 * @returns {{applied:number}}
 */
export function applyAllOrNothing(plan, options = {}) {
  if (!Array.isArray(plan) || plan.length === 0) return { applied: 0 };

  /*
   * ⓿ Every file the plan touches must be unreserved, not only the named one:
   * rename, reclassify and merge rewrite backlinks in documents nobody named.
   * Guarded here, where every multi-file plan passes, so a new tool inherits it;
   * the whole plan is refused and nothing is written.
   */
  if (options.allowReservedTargets !== true) {
    for (const entry of plan) {
      const reserved = reservedForHumanIssue(entry.path);
      if (reserved) throw new Error(reserved);
    }
  }

  /*
   * ⓪ A plan that writes and then deletes the same file drops the delete. A
   * case-only rename (write `auth.md`, delete `Auth.md`) names one file on macOS
   * and Windows, and the delete would erase what was just written. Rename, merge
   * and reclassify all build this plan, so the write layer compares real paths.
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
   * ⓪-b If someone edited a target since the planner's snapshot, write nothing.
   * Rename, merge and reclassify rewrite N documents read minutes earlier; an
   * entry without `expectedMtime` is not checked.
   */
  const conflicts = [];
  for (const entry of plan) {
    if (entryChangedOnDisk(entry)) conflicts.push(entry.path);
  }
  if (conflicts.length > 0) {
    throw changedOnDiskError(conflicts);
  }

  // ① Pre-check before writing anything, so the common failures (read-only or
  //    locked file, read-only vault) need no rollback.
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
        // Deleting needs write permission on the directory, not the file.
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

  // ② Apply, keeping each entry's prior state for rollback.
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
    // A delete invalidates the gate index, so the removed slug stops resolving.
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
 * Rewrites every frontmatter graph key and body link pointing at `targetSlug`
 * to `nextSlug`, for rename_concept and merge_concepts. Matches like
 * findBacklinks (absolute slug, last segment, path-prefixed tail); a tail is
 * rewritten with the tail of `nextSlug`, so the new name shows in every form.
 *
 * With `dryRun` it previews without writing. `excludeSlugs` skips documents the
 * caller replaces in the same plan. Pass `targetKind` only when the node changes
 * kind (reclassify_concept): an entry in a kind-named list (domains,
 * capabilities, elements) moves to the list for `targetKind` when the
 * referrer's kind keeps one (`containmentKeyFor`, spec §5), else it stays and is
 * listed in `keptInPlace`; then `targetSlug === nextSlug` is a kind change in place.
 *
 * Returns `{ updates: [{ slug, beforeKeys, afterKeys, bodyHit }], totalUpdated, keptInPlace }`.
 */
export function redirectBacklinks(rootPath, targetSlug, nextSlug, options = {}) {
  /**
   * With `deferWrite` it returns the plan without touching disk, so the caller merges its
   * own writes into one all-or-nothing apply (`dryRun` is a preview for the user).
   */
  const { dryRun = false, deferWrite = false, excludeSlugs = [], targetKind = null } = options;
  const excluded = new Set(Array.isArray(excludeSlugs) ? excludeSlugs : []);
  if (typeof targetSlug !== 'string' || !targetSlug) {
    throw new Error('targetSlug is required.');
  }
  if (typeof nextSlug !== 'string' || !nextSlug) {
    throw new Error('nextSlug is required.');
  }
  if (targetSlug === nextSlug && !targetKind) {
    return { updates: [], totalUpdated: 0, plan: [] };
  }
  const renaming = targetSlug !== nextSlug;

  const docs = loadVaultDocs(rootPath);
  const targetTail = targetSlug.split('/').pop();
  const nextTail = nextSlug.split('/').pop();
  const tailMatches = docs
    .map((doc) => doc.slug)
    .filter((slug) => slug.split('/').pop() === targetTail);
  // A bare or suffix tail is rewritten only while it resolves uniquely; with
  // capabilities/foo and elements/foo both present, rewriting "foo" could redirect
  // the wrong concept. Exact canonical refs stay safe.
  const canRewriteTail = tailMatches.length === 1 && tailMatches[0] === targetSlug;

  function rewriteArrayItem(value) {
    if (typeof value !== 'string') return { value, changed: false };
    if (value === targetSlug) return { value: nextSlug, changed: true };
    if (canRewriteTail && value === targetTail) return { value: nextTail, changed: true };
    if (canRewriteTail && value.endsWith(`/${targetTail}`)) {
      const prefix = value.slice(0, value.length - targetTail.length);
      return { value: `${prefix}${nextTail}`, changed: true };
    }
    return { value, changed: false };
  }

  const updates = [];
  const keptInPlace = [];
  /** Applied in one go once the loop ends. */
  const plan = [];
  for (const doc of docs) {
    if (doc.slug === targetSlug || excluded.has(doc.slug)) continue;
    const filePath = slugToPath(rootPath, doc.slug);
    const nextFm = { ...doc.frontmatter };
    const beforeKeys = [];
    const afterKeys = [];
    let fmChanged = false;
    // When the rewritten document is the destination (merge scans the survivor),
    // every rewrite would point at itself, so such refs are dropped instead; the
    // removal stays visible in beforeKeys/afterKeys.
    const rewritingSelf = doc.slug === nextSlug;

    // A kind change in place rewrites no address; running this pass would record
    // no-op updates, since `rewriteArrayItem` reports a match as `changed`.
    for (const key of renaming ? Object.keys(nextFm) : []) {
      const value = nextFm[key];
      if (Array.isArray(value)) {
        const before = [...value];
        const rewritten = value.map((v) => rewriteArrayItem(v));
        const after = rewritten
          .filter((r) => !(rewritingSelf && r.changed))
          .map((r) => r.value);
        if (before.length !== after.length || before.some((b, i) => b !== after[i])) {
          const deduped = normalizeRelationRefs(after);
          nextFm[key] = deduped;
          beforeKeys.push({ key, before });
          // An emptied array is reported with `after` omitted, the removal shape.
          afterKeys.push(deduped.length > 0 ? { key, after: deduped } : { key });
          fmChanged = true;
        }
      } else if (typeof value === 'string') {
        // Only reference slots are rewritten (`domain:` and GRAPH_ARRAY_KEYS). An
        // evidence string such as `path:` is not a reference, and the tail-suffix
        // clause would otherwise point it at a file that does not exist.
        const isRefSlot = key === 'domain' || GRAPH_ARRAY_KEY_SET.has(key);
        const r = isRefSlot ? rewriteArrayItem(value) : { changed: false };
        if (r.changed) {
          if (rewritingSelf) {
            delete nextFm[key];
            beforeKeys.push({ key, before: value });
            afterKeys.push({ key });
          } else {
            nextFm[key] = r.value;
            beforeKeys.push({ key, before: value });
            afterKeys.push({ key, after: r.value });
          }
          fmChanged = true;
        }
      } else if (value && typeof value === 'object') {
        // An object map's keys (`relation_notes: {ref: "why"}`) are rename targets too,
        // or the rationale is orphaned. On a collision the existing new-key value wins
        // (the more recent intent; overwriting it is silent loss) and the displaced old
        // value stays in beforeKeys.
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
          // A note keyed to the document itself goes with the self-ref it annotated.
          if (rewritingSelf) continue;
          if (r.value in nextMap || entries.some(([k]) => k === r.value)) {
            continue;
          }
          nextMap[r.value] = mapValue;
        }
        if (mapChanged) {
          for (const [mapKey, mapValue] of entries) {
            if (!(mapKey in nextMap) && !rewriteArrayItem(mapKey).changed) nextMap[mapKey] = mapValue;
          }
          beforeKeys.push({ key, before: value });
          if (Object.keys(nextMap).length > 0) {
            afterKeys.push({ key, after: nextMap });
            nextFm[key] = nextMap;
          } else {
            // The last note went with a dropped self-ref: remove the empty map too.
            afterKeys.push({ key });
            delete nextFm[key];
          }
          fmChanged = true;
        }
      }
    }

    /*
     * A kind change moves an entry between kind-named lists, not only its
     * address: `capabilities: [elements/x]` resolves silently and the dense-parent check
     * counts it as a capability. The entry follows the node into its new kind's list
     * when the referrer's kind keeps one (spec §5, `containmentKeyFor`); otherwise
     * it stays and is reported in `keptInPlace`. A merge survivor is skipped.
     */
    if (targetKind && !rewritingSelf) {
      const holderKind = typeof doc.frontmatter?.kind === 'string' ? doc.frontmatter.kind.trim() : '';
      const destination = containmentKeyFor(holderKind, targetKind);
      const namesTarget = (value) => typeof value === 'string' && rewriteArrayItem(value).changed;
      const recordKeyChange = (key, after) => {
        if (!beforeKeys.some((row) => row.key === key)) {
          const before = doc.frontmatter[key];
          beforeKeys.push(Array.isArray(before) && before.length > 0 ? { key, before: [...before] } : { key });
        }
        const row = after.length > 0 ? { key, after } : { key };
        const index = afterKeys.findIndex((existing) => existing.key === key);
        if (index === -1) afterKeys.push(row);
        else afterKeys[index] = row;
      };
      for (const key of Object.values(CONTAINMENT_KEY_FOR_KIND)) {
        const written = doc.frontmatter[key];
        if (!Array.isArray(written)) continue;
        const hits = [...new Set(written.filter(namesTarget).map((value) => rewriteArrayItem(value).value))];
        if (hits.length === 0 || destination === key) continue;
        // A destination written as a non-list cannot take the entry without losing
        // what it holds, so it is kept like a missing list.
        const destinationWritten = destination ? doc.frontmatter[destination] : undefined;
        if (!destination || (destinationWritten !== undefined && !Array.isArray(destinationWritten))) {
          for (const ref of hits) {
            keptInPlace.push({ slug: doc.slug, title: docTitle(doc), key, ref, holderKind });
          }
          continue;
        }
        const source = Array.isArray(nextFm[key]) ? nextFm[key] : [];
        const target = Array.isArray(nextFm[destination]) ? nextFm[destination] : [];
        const alreadyListed = (destinationWritten ?? []).some(namesTarget);
        const nextSource = normalizeRelationRefs(source.filter((value) => !hits.includes(value)));
        const nextTarget = normalizeRelationRefs(alreadyListed ? target : [...target, ...hits]);
        recordKeyChange(key, nextSource);
        recordKeyChange(destination, nextTarget);
        nextFm[key] = nextSource;
        nextFm[destination] = nextTarget;
        fmChanged = true;
      }
      // A `domain:` parent that is no longer a domain has no list to move to at all.
      const parent = doc.frontmatter.domain;
      if (targetKind !== 'domain' && namesTarget(parent)) {
        keptInPlace.push({
          slug: doc.slug,
          title: docTitle(doc),
          key: 'domain',
          ref: rewriteArrayItem(parent).value,
          holderKind,
        });
      }
    }

    let nextBody = doc.body;
    let bodyChanged = false;
    /*
     * Body links take more shapes than frontmatter: the wikilinks for a slug,
     * a heading and an alias (`[[slug]]`, `[[slug#h]]`, `[[slug|alias]]`) and the
     * markdown links (`(slug.md)`, `(slug.md#a)`, `(…/slug.md)`). Missing one
     * leaves it dangling, permanently after a merge deletes the old file. All
     * route through `rewriteArrayItem` for its tail rules and ambiguity guard.
     * Bare prose paths are evidence, not references; a kind change in place
     * leaves the body.
     */
    if (renaming) {
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
    }

    if (!fmChanged && !bodyChanged) continue;

    updates.push({
      slug: doc.slug,
      title: docTitle(doc),
      beforeKeys,
      afterKeys,
      bodyChanged,
    });

    // Planned, not written: a failure on a later file must not leave a half vault.
    plan.push({
      op: 'write',
      path: filePath,
      content: buildMarkdown({ frontmatter: nextFm, body: nextBody }),
      // The snapshot may be minutes old; a person's edit since then must not be overwritten.
      expectedMtime: doc.mtime,
      expectedRaw: doc.raw,
    });
  }

  if (!dryRun && !deferWrite) applyAllOrNothing(plan, { requireRevisions: true });

  return {
    updates,
    totalUpdated: updates.length,
    keptInPlace,
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
 * Advisory warning when a new title equals an existing one after normalisation
 * (lowercase, collapsed whitespace), else null. Exact match only, since fuzzy
 * matching flags genuinely different concepts (auth-login vs auth-logout); the
 * node itself and empty titles are excluded. Never blocks the write.
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

/** Requires an absolute path to a directory; a folder with no frontmatter is an empty vault. */
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
