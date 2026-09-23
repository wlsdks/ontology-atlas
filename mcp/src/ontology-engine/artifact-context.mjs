import { buildSlugNotFoundGrowthHint } from '../growth-hint.mjs';
import { suggestCompiledSlugs } from '../suggestions.mjs';
import { edgeSortKey } from './query-primitives.mjs';

/** Build the immutable indexes shared by ontology query families. */
export function createArtifactContext(artifact, options = {}) {
  const nodes = Array.isArray(artifact?.nodes) ? artifact.nodes : [];
  const edges = Array.isArray(artifact?.edges) ? artifact.edges : [];
  const sourceDocBySlug = new Map(
    (Array.isArray(options.sourceDocs) ? options.sourceDocs : []).map((doc) => [doc.slug, doc]),
  );
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

  // Keep unresolved names queryable as evidence even though they are not nodes.
  const referencedOnlyByRef = new Map();
  for (const edge of edges) {
    if (edge.resolved) continue;
    const list = referencedOnlyByRef.get(edge.ref);
    if (list) {
      if (!list.some((hit) => hit.slug === edge.from && hit.via === edge.via)) {
        list.push({ slug: edge.from, via: edge.via });
      }
    } else {
      referencedOnlyByRef.set(edge.ref, [{ slug: edge.from, via: edge.via }]);
    }
  }
  for (const list of referencedOnlyByRef.values()) {
    list.sort((left, right) => left.slug.localeCompare(right.slug) || left.via.localeCompare(right.via));
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
    artifact,
    nodes,
    edges,
    sourceDocBySlug,
    nodeBySlug,
    aliasToSlug,
    ambiguousAliasByName,
    outgoing,
    incoming,
    referencedOnlyByRef,
    resolve,
    resolveWithGrowthHint,
  };
}
