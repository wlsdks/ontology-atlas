import { nodeUidIssue } from '../schema.mjs';

import { docTitle, loadVaultDocs } from './documents.mjs';
import { collectNeighborRefs, relationNoteFor } from './relation-refs.mjs';

function assertBoundedNonNegativeInteger(value, name, { max }) {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative integer.`);
  }
  if (value > max) {
    throw new Error(`${name} must be <= ${max}.`);
  }
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
        // hops are pushed then reversed once; edges are unshifted (O(D²), but
        // D ≤ maxHops ≤ 20). edges[i] carries the `via` key between hops i and
        // i+1, plus the declaring document's `rationale` when it has one.
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

export function findBacklinks(rootPath, targetSlug, options = {}) {
  const includeAmbiguous = options.includeAmbiguousTailRefs === true;
  const docs = loadVaultDocs(rootPath);
  const { resolve: resolveRef, resolveCandidates } = buildRefIndex(docs);
  const resolvedTarget = resolveRef(targetSlug) || targetSlug;
  const matches = [];
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
    const bodyHit = [...bodyNeedles].some(
      (needle) =>
        doc.body.includes(`[[${needle}]]`) ||
        doc.body.includes(`[[${needle}#`) ||
        doc.body.includes(`[[${needle}|`) ||
        doc.body.includes(`(${needle}.md`) ||
        doc.body.includes(`/${needle}.md`),
    );
    if (matchedKeys.length === 0 && !bodyHit) continue;
    const isNode = typeof doc.frontmatter.kind === 'string' && doc.frontmatter.kind.trim() !== '';
    matches.push({
      ...(isNode && nodeUidIssue(doc.frontmatter.uid) === null ? { uid: doc.frontmatter.uid } : {}),
      slug: doc.slug,
      ...(isNode ? { kind: doc.frontmatter.kind } : {}),
      isNode,
      title: doc.frontmatter.title || doc.frontmatter.name || doc.slug,
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
