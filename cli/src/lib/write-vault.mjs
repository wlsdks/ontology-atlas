import { mkdirSync, existsSync, readFileSync, realpathSync } from 'node:fs';
import { readFileRevision, sameFileRevision, writeFileAtomically } from './atomic-write.mjs';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { buildMarkdown, parseFrontmatter } from './parse-frontmatter.mjs';
import { VAULT_SOURCES_DIR, flatSlugIssue, inspectMergedUids, nodeUidIssue, rawSourceSlugIssue, unwritableSlugIssue } from './schema.mjs';
import { walkMd, pathToSlug } from './walk-vault.mjs';

/**
 * Vault-relative slug → file path, checked for containment so a malicious slug from an agent or prompt
 * injection ('../../etc/passwd') cannot name a file outside the vault. Same contract as mcp/src/vault/ slugToPath.
 */
export function slugToPath(rootPath, slug) {
  if (typeof slug !== 'string' || slug.length === 0) {
    throw new Error('slug must be a non-empty string');
  }
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
  const rawSourceSlug = rawSourceSlugForPath(normalizedRoot, candidate);
  if (rawSourceSlug) throw new Error(rawSourceSlugIssue(rawSourceSlug));
  // A string check alone cannot stop a symlink: `writeFileSync` follows a link inside the vault and writes
  // outside it. Same contract as `mcp/src/vault/`.
  assertRealPathInside(candidate, normalizedRoot, slug);
  return candidate;
}

function slugToWritePath(rootPath, slug) {
  const issue = unwritableSlugIssue(slug);
  if (issue) throw new Error(issue);
  const filePath = slugToPath(rootPath, slug);
  const real = realSegmentsBelowRoot(resolve(rootPath), filePath);
  const resolved = real ? segmentsToSlug(real) : slug;
  const resolvedIssue = resolved === slug ? null : unwritableSlugIssue(resolved);
  if (resolvedIssue) throw new Error(`slug "${slug}" resolves through a link to "${resolved}". ${resolvedIssue}`);
  return filePath;
}

/** Still inside the vault after link resolution. A path that does not exist yet is
 * judged by its nearest existing ancestor. */
function assertRealPathInside(candidate, normalizedRoot, slug) {
  let realRoot;
  try {
    realRoot = realpathSync(normalizedRoot);
  } catch {
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

function rawSourceSlugForPath(normalizedRoot, candidate) {
  const spelled = relative(normalizedRoot, candidate).split(sep);
  if (namesRawSource(spelled)) return segmentsToSlug(spelled);
  const real = realSegmentsBelowRoot(normalizedRoot, candidate);
  return real && namesRawSource(real) ? segmentsToSlug(real) : null;
}

function namesRawSource(segments) {
  return segments.length > 1 && segments[0] === VAULT_SOURCES_DIR;
}

function segmentsToSlug(segments) {
  return segments.join('/').replace(/\.md$/, '');
}

function realSegmentsBelowRoot(normalizedRoot, candidate) {
  try {
    const realRoot = realpathSync.native(normalizedRoot);
    const unresolved = [];
    for (let probe = candidate; ; probe = dirname(probe)) {
      try {
        return relative(realRoot, join(realpathSync.native(probe), ...unresolved)).split(sep);
      } catch {
        if (dirname(probe) === probe) return null;
        unresolved.unshift(basename(probe));
      }
    }
  } catch {
    return null;
  }
}

/**
 * Writes a new doc, creating directories; throws when the file exists, never overwriting the user's work.
 * Same contract as writeDoc in mcp/src/vault/.
 */
export function writeDoc(rootPath, slug, { frontmatter, body = '' }) {
  const filePath = preflightWriteDoc(rootPath, slug, frontmatter);
  mkdirSync(dirname(filePath), { recursive: true });
  const md = buildMarkdown({ frontmatter, body });
  writeFileAtomically(filePath, md);
  return filePath;
}

/** The single preflight through which a dry run and a real write check the same
 * slug and UID contract. */
export function preflightWriteDoc(rootPath, slug, frontmatter) {
  const filePath = slugToWritePath(rootPath, slug);
  if (existsSync(filePath)) {
    throw new Error(`Doc already exists: ${slug}`);
  }
  const slugIssue = flatSlugIssue(frontmatter?.kind, slug);
  if (slugIssue) throw new Error(slugIssue);
  assertNodeIdentity(rootPath, slug, frontmatter);
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
  for (const file of walkMd(rootPath)) {
    const existingSlug = pathToSlug(rootPath, file);
    if (existingSlug === slug) continue;
    const { frontmatter: existing } = parseFrontmatter(readFileSync(file, 'utf-8'));
    for (const claimed of identityClaims(existing)) {
      if (!claims.has(claimed)) continue;
      throw new Error(
        `UID collision: ${claimed} already belongs to "${existingSlug}". ` +
          'Create a new node with a fresh UID instead of copying an identity.',
      );
    }
  }
}

/**
 * Reads an existing doc and returns its raw text, parsed data and revision;
 * throws when the file is missing. Used to read current state before a patch.
 */
export function readDocFrontmatter(rootPath, slug) {
  const filePath = slugToPath(rootPath, slug);
  const before = readFileRevision(filePath);
  if (!before) {
    throw new Error(`Doc not found: "${slug}".`);
  }
  const raw = readFileSync(filePath, 'utf-8');
  const revision = readFileRevision(filePath);
  if (!sameFileRevision(before, revision)) {
    throw new Error(`Conflict: document changed or was deleted while reading: ${filePath}. Re-read and retry.`);
  }
  const { frontmatter, body } = parseFrontmatter(raw);
  return { filePath, frontmatter, body, revision, raw };
}

/**
 * Replaces one frontmatter key of an existing doc, keeping the rest and the body; the read → merge → rewrite
 * contract of patchFrontmatter in mcp/src/vault/, written with the CLI's own fs calls like `add` and `import`.
 */
export function writeFrontmatterKey(rootPath, slug, key, value, options) {
  return writeFrontmatterKeys(rootPath, slug, { [key]: value }, options);
}

/** Several keys in one file write, so a relation and its relation_notes land
 * atomically — written separately, a failure between them leaves one without the
 * other. */
export function writeFrontmatterKeys(rootPath, slug, patch, { expectedRevision = null } = {}) {
  const filePath = slugToWritePath(rootPath, slug);
  let current;
  try {
    current = readDocFrontmatter(rootPath, slug);
  } catch (error) {
    if (expectedRevision && !existsSync(filePath)) {
      throw new Error(`Conflict: document changed or was deleted before write: ${filePath}. Re-read and retry.`);
    }
    throw error;
  }
  const { frontmatter, body, revision } = current;
  if (expectedRevision && !sameFileRevision(expectedRevision, revision)) {
    throw new Error(`Conflict: document changed or was deleted before write: ${filePath}. Re-read and retry.`);
  }
  if ('uid' in patch && patch.uid !== frontmatter.uid) {
    throw new Error('`uid:` is immutable and cannot be changed by a generic frontmatter writer.');
  }
  if ('merged_uids' in patch) {
    throw new Error('`merged_uids:` is merge_concepts-owned identity history.');
  }
  const next = { ...frontmatter, ...patch };
  assertNodeIdentity(rootPath, slug, next);
  const repairedKeys = Object.keys(patch).filter((key) => patch[key] !== undefined);
  const md = buildMarkdown({ frontmatter: next, body, source: current.raw, repairedKeys });
  writeFileAtomically(filePath, md, { expectedRevision });
  return filePath;
}

/**
 * Dedupes and locale-sorts string refs and appends other values unchanged, like normalizeRelationRefs in
 * mcp/src/vault/, so `relate` writes the same shape as MCP `add_relation`.
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
