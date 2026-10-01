import { buildSlugNotFoundGrowthHint } from '../growth-hint.mjs';
import { suggestCompiledSlugs } from '../suggestions.mjs';
import { edgeSortKey } from './query-primitives.mjs';

const sharedArtifacts = new WeakSet();
const indexesByArtifact = new WeakMap();

export function shareArtifact(artifact) {
  sharedArtifacts.add(deepFreeze(artifact));
  return artifact;
}

function deepFreeze(value) {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const item of Object.values(value)) deepFreeze(item);
  }
  return value;
}

export function createArtifactContext(artifact, options = {}) {
  const sourceDocBySlug = new Map(
    (Array.isArray(options.sourceDocs) ? options.sourceDocs : []).map((doc) => [doc.slug, doc]),
  );
  const shared = sharedArtifacts.has(artifact);
  let indexes = shared ? indexesByArtifact.get(artifact) : undefined;
  if (!indexes) {
    indexes = buildArtifactIndexes(artifact, shared);
    if (shared) indexesByArtifact.set(artifact, indexes);
  }
  return { artifact, ...indexes, sourceDocBySlug };
}

function buildArtifactIndexes(artifact, shared) {
  const nodes = Array.isArray(artifact?.nodes) ? artifact.nodes : [];
  const edges = Array.isArray(artifact?.edges) ? artifact.edges : [];
  const nodeBySlug = new Map(nodes.map((node) => [node.slug, node]));
  const aliasToSlug = new Map(
    (Array.isArray(artifact?.aliases) ? artifact.aliases : []).map(({ alias, slug }) => [alias, slug]),
  );
  const ambiguousAliasByName = new Map(
    (Array.isArray(artifact?.ambiguousAliases) ? artifact.ambiguousAliases : []).map((entry) => [
      entry.alias,
      entry.slugs,
    ]),
  );

  const outgoing = new Map();
  const incoming = new Map();
  // Every adjacency list is a subsequence of this order. Compute each key once
  // instead of rebuilding it for every comparison in both indexes. Compiler
  // output is already ordered, but callers may supply an unordered artifact.
  const orderedEdges = edges.map((edge) => ({ edge, key: edgeSortKey(edge) }));
  orderedEdges.sort((left, right) => left.key.localeCompare(right.key));
  for (const { edge } of orderedEdges) {
    if (!outgoing.has(edge.from)) outgoing.set(edge.from, []);
    outgoing.get(edge.from).push(edge);
    if (edge.resolved) {
      if (!incoming.has(edge.to)) incoming.set(edge.to, []);
      incoming.get(edge.to).push(edge);
    }
  }
  for (const list of [...outgoing.values(), ...incoming.values()]) Object.freeze(list);

  // Index unresolved evidence in O(E); sort unique pairs once per reference.
  const referencedOnlyByRef = new Map();
  const sourcesByRefAndRelation = new Map();
  for (const edge of edges) {
    if (edge.resolved) continue;
    let byRelation = sourcesByRefAndRelation.get(edge.ref);
    if (!byRelation) {
      byRelation = new Map();
      sourcesByRefAndRelation.set(edge.ref, byRelation);
    }
    let sources = byRelation.get(edge.via);
    if (!sources) {
      sources = new Set();
      byRelation.set(edge.via, sources);
    }
    if (!Number.isNaN(edge.from) && !Number.isNaN(edge.via) && sources.has(edge.from)) continue;
    sources.add(edge.from);
    const hit = Object.freeze({ slug: edge.from, via: edge.via });
    const list = referencedOnlyByRef.get(edge.ref);
    if (list) list.push(hit);
    else referencedOnlyByRef.set(edge.ref, [hit]);
  }
  for (const list of referencedOnlyByRef.values()) {
    list.sort((left, right) => left.slug.localeCompare(right.slug) || left.via.localeCompare(right.via));
    Object.freeze(list);
  }

  // Frozen alias index: O(A log A) build; O(result) reads.
  let aliasesBySlug;
  function aliasesFor(slug) {
    if (!shared) {
      return (Array.isArray(artifact?.aliases) ? artifact.aliases : [])
        .filter(entry => entry.slug === slug).map(entry => entry.alias).sort();
    }
    if (!aliasesBySlug) {
      aliasesBySlug = new Map();
      for (const entry of Array.isArray(artifact?.aliases) ? artifact.aliases : []) {
        if (Number.isNaN(entry.slug)) continue;
        const list = aliasesBySlug.get(entry.slug);
        if (list) list.push(entry.alias);
        else aliasesBySlug.set(entry.slug, [entry.alias]);
      }
      for (const [slug, list] of aliasesBySlug) aliasesBySlug.set(slug, Object.freeze(list.sort().slice()));
    }
    return [...(aliasesBySlug.get(slug) ?? [])];
  }

  function resolve(input, fieldName = 'slug') {
    if (typeof input !== 'string' || !input.trim()) {
      throw new Error(`${fieldName} (string) is required.`);
    }
    const candidate = input.trim();
    if (nodeBySlug.has(candidate)) return candidate;
    const aliased = aliasToSlug.get(candidate);
    if (aliased) return aliased;
    const ambiguous = ambiguousAliasByName.get(candidate);
    if (ambiguous) {
      throw new Error(
        `${fieldName} "${candidate}" is ambiguous. Use a canonical slug: ${ambiguous.join(', ')}`,
      );
    }
    const referencedBy = referencedOnlyByRef.get(candidate) ?? [];
    if (referencedBy.length > 0) {
      const cited = referencedBy.map((hit) => `${hit.slug} (via ${hit.via})`).join(', ');
      const error = new Error(
        `${fieldName} "${candidate}" is referenced by the vault but has no document of its own, so it is not a compiled node. Referenced by: ${cited}. Create it with add_concept({slug:"${candidate}"}) to make it queryable.`,
      );
      error.referencedBy = referencedBy;
      throw error;
    }
    const similar = suggestCompiledSlugs(candidate, [...nodeBySlug.keys()]);
    const hint = similar.length > 0 ? ` Did you mean: ${similar.join(', ')}?` : '';
    throw new Error(`${fieldName} "${candidate}" does not resolve to a compiled ontology node.${hint}`);
  }

  function resolveWithGrowthHint(input, fieldName = 'slug') {
    try {
      return resolve(input, fieldName);
    } catch (error) {
      const candidate = typeof input === 'string' ? input.trim() : String(input ?? '');
      if (error instanceof Error && Array.isArray(error.referencedBy) && error.referencedBy.length > 0) {
        error.growthHint = buildSlugNotFoundGrowthHint({ slug: candidate, referencedBy: error.referencedBy });
      } else if (
        error instanceof Error &&
        /does not resolve to a compiled ontology node/.test(error.message)
      ) {
        const candidateSlugs = suggestCompiledSlugs(candidate, [...nodeBySlug.keys()]);
        error.growthHint = buildSlugNotFoundGrowthHint({ slug: candidate, candidateSlugs });
      }
      throw error;
    }
  }

  return {
    nodes,
    edges,
    nodeBySlug,
    aliasToSlug,
    aliasesFor,
    ambiguousAliasByName,
    outgoing,
    incoming,
    referencedOnlyByRef,
    resolve,
    resolveWithGrowthHint,
  };
}
