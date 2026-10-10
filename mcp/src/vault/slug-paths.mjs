import { readdirSync, existsSync, realpathSync, statSync } from 'node:fs';
import { basename, join, relative, dirname, resolve, sep } from 'node:path';
import { VAULT_SOURCES_DIR, rawSourceSlugIssue, unwritableSlugIssue } from '../schema.mjs';

/** Absolute paths of every `.md` in the vault except dotfiles, build folders and sources/. */
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
        if (dir === rootPath && entry.name === VAULT_SOURCES_DIR) continue;
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
  const rawSourceSlug = rawSourceSlugForPath(normalizedRoot, candidate);
  if (rawSourceSlug) throw new Error(rawSourceSlugIssue(rawSourceSlug));
  // writeFileSync follows a link, so the real path must stay inside too.
  assertRealPathInside(candidate, normalizedRoot, slug);
  return candidate;
}

/** `slugToPath` for a file a write tool will create, change or delete; refuses what `unwritableSlugIssue` names, as typed or where it resolves. */
export function slugToWritePath(rootPath, slug) {
  const issue = unwritableSlugIssue(slug);
  if (issue) throw new Error(issue);
  const filePath = slugToPath(rootPath, slug);
  const real = realSegmentsBelowRoot(resolve(rootPath), filePath);
  const resolved = real ? segmentsToSlug(real) : slug;
  const resolvedIssue = resolved === slug ? null : unwritableSlugIssue(resolved);
  if (resolvedIssue) throw new Error(`slug "${slug}" resolves through a link to "${resolved}". ${resolvedIssue}`);
  return filePath;
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

function rawSourceSlugForPath(normalizedRoot, candidate) {
  const spelled = relative(normalizedRoot, candidate).split(sep);
  if (namesRawSource(spelled)) return segmentsToSlug(spelled);
  // A case-folding disk opens `ſources/` as `sources/`, and a link can alias it.
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

export function rawSourceSlugAt(rootPath, slug) {
  if (typeof slug !== 'string' || slug.length === 0 || slug.includes('\0')) return null;
  const normalizedRoot = resolve(rootPath);
  return rawSourceSlugForPath(normalizedRoot, resolve(normalizedRoot, `${slug}.md`));
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

/**
 * Up to `limit` existing slugs similar to `badSlug`, for a not-found error's
 * next action. First stage that hits wins: exact tail, tail substring either
 * way, tail prefix. Substring only: an edit distance is costly on a large vault
 * and noisy, and the goal is "these exist", not "did you mean".
 */
export function suggestSimilarSlugs(rootPath, badSlug, limit = 3) {
  if (typeof badSlug !== 'string' || badSlug.length === 0) return [];
  const all = walkMd(rootPath).map((filePath) => pathToSlug(rootPath, filePath)).filter((s) => s !== badSlug);
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
