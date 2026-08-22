// Matching logic for the commit preflight (`ontology-atlas preflight`).
//
// A vault node's frontmatter points at source files through two fields:
//   - `path:` (element) — a single source-file path
//   - `elements:` (capability) — a list of source paths (or ontology slug refs)
// `mcp/src/detect-drift.mjs` uses that convention forwards (does the node's path
// exist on disk); this goes backwards — given the files git changed, find the vault
// nodes referencing those paths. The CLI ships separately and cannot import
// mcp/src directly (the monorepo relative path is not always there), so it mirrors
// just the looksLikePath / isOntologySlug decisions. **Change a value here and
// check mcp/src/detect-drift.mjs in the same pass.**

const ONTOLOGY_SLUG_PREFIXES = ['capabilities/', 'domains/', 'elements/', 'documents/'];

function looksLikePath(value) {
  return (
    value.includes('/') ||
    value.endsWith('.ts') ||
    value.endsWith('.js') ||
    value.endsWith('.mjs') ||
    value.endsWith('.tsx') ||
    value.endsWith('.json')
  );
}

function isOntologySlug(value) {
  return ONTOLOGY_SLUG_PREFIXES.some((prefix) => value.startsWith(prefix));
}

function normalizePath(value) {
  return String(value ?? '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\.\//, '')
    .replace(/\/+$/, '');
}

// Matches when the changed file equals the entry exactly, or when the entry is a
// directory path containing it (frontmatter is allowed to name a directory).
function pathMatches(changedFile, entryPath) {
  const changed = normalizePath(changedFile);
  const entry = normalizePath(entryPath);
  if (!changed || !entry) return false;
  return changed === entry || changed.startsWith(`${entry}/`);
}

/**
 * @param {Array<{slug: string, frontmatter: Record<string, unknown>}>} docs
 * @param {string[]} changedFiles  repo-relative changed file paths
 * @returns {Array<{slug: string, kind: string, title: string, domain: string, matchedFiles: string[]}>}
 *   sorted by slug, each with the deduped/sorted list of changed files it references.
 */
export function matchChangedFilesToVaultNodes(docs, changedFiles) {
  const changed = Array.isArray(changedFiles)
    ? changedFiles.map(normalizePath).filter(Boolean)
    : [];
  if (changed.length === 0 || !Array.isArray(docs)) return [];

  const matches = [];
  for (const doc of docs) {
    const fm = doc?.frontmatter ?? {};
    const kind = typeof fm.kind === 'string' ? fm.kind.trim() : '';
    if (!kind) continue;

    const matchedFiles = new Set();

    if (typeof fm.path === 'string' && fm.path.trim()) {
      for (const cf of changed) {
        if (pathMatches(cf, fm.path)) matchedFiles.add(cf);
      }
    }

    if (Array.isArray(fm.elements)) {
      for (const el of fm.elements) {
        if (typeof el !== 'string') continue;
        const entry = el.trim();
        if (!entry || !looksLikePath(entry) || isOntologySlug(entry)) continue;
        for (const cf of changed) {
          if (pathMatches(cf, entry)) matchedFiles.add(cf);
        }
      }
    }

    if (matchedFiles.size > 0) {
      matches.push({
        slug: String(doc.slug ?? '').trim(),
        kind,
        title:
          (typeof fm.title === 'string' && fm.title.trim()) ||
          (typeof fm.name === 'string' && fm.name.trim()) ||
          String(doc.slug ?? ''),
        domain: typeof fm.domain === 'string' ? fm.domain : '',
        matchedFiles: [...matchedFiles].sort(),
      });
    }
  }

  matches.sort((a, b) => a.slug.localeCompare(b.slug));
  return matches;
}
