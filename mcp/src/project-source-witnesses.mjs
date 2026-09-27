/**
 * Source-role witnesses from vault documents: each is one claim that a node is
 * implemented at a repo-relative path, and the count that lands is a source
 * binding's only honest confidence signal. The app derives the same set in
 * its home view (src/views/home/lib/project-source-witnesses.ts), and the
 * contract test tests/contract/project-source-connect.contract.test.ts pins the
 * two together so a receipt means the same on both surfaces.
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
  if (value === '.') return true;
  if (
    typeof value !== 'string'
    || !value
    || value.trim() !== value
    || value.startsWith('/')
    || /^[A-Za-z]:[\\/]/.test(value)
    || value.includes('\\')
    || /[\u0000-\u001f\u007f]/u.test(value)
  ) return false;
  const normalized = normalizeWitnessPath(value);
  return normalized.length > 0
    && normalized.length <= 500
    && normalized.split('/').every((segment) => segment !== '' && segment !== '.' && segment !== '..');
}

function normalizeWitnessPath(value) {
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
 *   The caller must scope `docs` to the project with the containment the project
 *   graph hash uses, so the two cannot disagree about "this project".
 */
export function deriveProjectSourceWitnessesFromDocs(input) {
  const docs = Array.isArray(input?.docs) ? input.docs : [];
  const candidates = [];
  const seenClaims = new Set();
  const add = (candidate) => {
    if (!looksLikeSourceWitnessPath(candidate.path)) return;
    const path = normalizeWitnessPath(candidate.path);
    // One path may witness different roles (a capability entrypoint and its
    // element): deduplicate a node's repeated claim, never the path globally.
    const claim = `${candidate.nodeSlug}\0${path}`;
    if (seenClaims.has(claim)) return;
    seenClaims.add(claim);
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
