/**
 * Source-role witnesses derived from vault documents.
 *
 * A witness is one explicit claim the ontology makes about the code: "this
 * node is implemented at this repo-relative path". The receipt checks each
 * claim against the bounded source inventory; the count of claims that land is
 * the only honest confidence signal a source binding has.
 *
 * This is the MCP/CLI-side derivation, over vault docs. The app derives the
 * same set from its in-memory graph
 * (`src/views/home/lib/project-source-witnesses.ts`); the two are pinned
 * together by `tests/contract/project-source-connect.contract.test.ts`,
 * because a receipt minted by one surface and read by the other must mean the
 * same thing.
 */

import { extractProjectMeaningEvidencePaths } from './project-meaning-evidence.mjs';

const KNOWN_CODE_EXT =
  /\.(ts|tsx|js|jsx|mjs|cjs|mts|cts|md|mdx|css|scss|json|ya?ml|py|rs|go|java|rb|swift|kt|vue|svelte|html|sql|sh)$/i;
const CODE_PATH_PREFIX =
  /^(src|app|cli|mcp|tests?|scripts?|docs|packages?|lib|apps?|internal|pkg)\//;

/** Mirror of `looksLikeCodePath` in `src/shared/lib/humanize-code-path-title.ts`. */
export function looksLikeCodePath(title) {
  const value = String(title ?? '').trim();
  if (!value.includes('/') || /\s/.test(value)) return false;
  return KNOWN_CODE_EXT.test(value) || CODE_PATH_PREFIX.test(value);
}

function looksLikeSourceWitnessPath(value) {
  return looksLikeCodePath(value) || /^[^/\\\s]+\.[A-Za-z0-9]+$/.test(value);
}

export function normalizeWitnessPath(value) {
  return String(value ?? '').replaceAll('\\', '/').replace(/^\.\//, '').replace(/^\/+/, '');
}

function roleForKind(kind) {
  return kind === 'capability' || kind === 'project' ? 'entrypoint' : 'implementation';
}

/** The app's graph node id for a vault doc: `${kind}:${last slug segment}`. */
function graphNodeId(doc) {
  const kind = typeof doc.frontmatter?.kind === 'string' ? doc.frontmatter.kind.trim() : '';
  const fmSlug = typeof doc.frontmatter?.slug === 'string' ? doc.frontmatter.slug.trim() : '';
  const idSlug = kind === 'project' && fmSlug ? fmSlug : (doc.slug.split('/').pop() || doc.slug);
  return `${kind}:${idSlug}`;
}

/**
 * @param {{projectSlug: string, docs: ReadonlyArray<{slug: string, frontmatter?: object, title?: string, body?: string}>}} input
 *   `docs` must already be scoped to the project (the same containment the
 *   project graph hash uses). Scoping lives with the caller so the hash and the
 *   witnesses can never disagree about what "this project" means.
 */
export function deriveProjectSourceWitnessesFromDocs(input) {
  const docs = Array.isArray(input?.docs) ? input.docs : [];
  const candidates = [];
  const seenPaths = new Set();
  const add = (candidate) => {
    const path = normalizeWitnessPath(candidate.path);
    if (!looksLikeSourceWitnessPath(path) || seenPaths.has(path)) return;
    seenPaths.add(path);
    candidates.push({ ...candidate, path });
  };

  for (const doc of docs) {
    const frontmatter = doc?.frontmatter ?? {};
    const path = frontmatter.path;
    if (typeof path === 'string' && path.trim()) {
      add({
        id: `${doc.slug}:path`,
        nodeSlug: doc.slug,
        role: roleForKind(frontmatter.kind),
        path,
      });
    }
    if (Array.isArray(frontmatter.elements)) {
      for (const element of frontmatter.elements) {
        if (typeof element !== 'string' || !looksLikeCodePath(element)) continue;
        const normalized = normalizeWitnessPath(element);
        add({
          id: `${doc.slug}:element:${normalized}`,
          nodeSlug: doc.slug,
          role: 'implementation',
          path: normalized,
        });
      }
    }
  }

  const projectDoc = docs.find((doc) => (
    doc?.frontmatter?.kind === 'project'
    && (doc.slug === input?.projectSlug || doc.frontmatter?.slug === input?.projectSlug)
  ));
  for (const [index, path] of extractProjectMeaningEvidencePaths(projectDoc?.body).entries()) {
    add({
      id: `competency-evidence:${index + 1}`,
      nodeSlug: projectDoc.slug,
      role: 'competency-evidence',
      path,
    });
  }

  // Undocumented raw-path element refs are still explicit source-role claims.
  for (const doc of docs) {
    const frontmatter = doc?.frontmatter ?? {};
    if (frontmatter.kind !== 'element') continue;
    const title = typeof frontmatter.title === 'string' && frontmatter.title.trim()
      ? frontmatter.title
      : doc.title;
    if (typeof title !== 'string' || !looksLikeCodePath(title)) continue;
    add({
      id: `${graphNodeId(doc)}:path`,
      nodeSlug: doc.slug,
      role: 'implementation',
      path: title,
    });
  }

  return candidates.sort((left, right) => left.id.localeCompare(right.id));
}
