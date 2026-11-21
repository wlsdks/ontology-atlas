import {
  formatPathEdge,
  normalizeLimit,
  normalizeTypes,
  summarizeNode,
} from '../query-operation/query-primitives.mjs';
import { connectedComponents, groupCommunities } from './cluster-rules.mjs';

/** How the graph falls into connected groups and communities, and which nodes resemble a given one. */
export function createClusterQueries({
  nodes,
  edges,
  nodeBySlug,
  resolve,
  traversalEdges,
  countBy,
  normalizeIterations,
  normalizeOptionalString,
  propagateCommunityLabels,
  roundScore,
  similarityScore,
  undirectedAdjacencyFrom,
}) {
  // health() needs both the displayed groups and the complete actionable
  // count. Share that traversal only within this engine and relation filter.
  const componentGroupsByTypes = new Map();

  function connectedComponentGroups(typeSet) {
    const key = JSON.stringify(typeSet ? [...typeSet].sort() : null);
    if (componentGroupsByTypes.has(key)) return componentGroupsByTypes.get(key);
    const groups = connectedComponents(nodes, (slug) => traversalEdges(slug, 'undirected', typeSet));
    componentGroupsByTypes.set(key, groups);
    return groups;
  }

  function components(options = {}) {
    const limit = normalizeLimit(options.limit, 20);
    const nodeLimit = normalizeLimit(options.nodeLimit, 25, 'nodeLimit');
    const typeSet = normalizeTypes(options.types);
    const groups = connectedComponentGroups(typeSet);

    return {
      operation: 'components',
      totalComponents: groups.length,
      largestSize: groups[0]?.size || 0,
      singletonCount: groups.filter((group) => group.size === 1).length,
      limited: groups.length > limit,
      components: groups.slice(0, limit).map((group, index) => ({
        id: index + 1,
        size: group.size,
        kinds: countBy(group.slugs.map((slug) => nodeBySlug.get(slug)).filter(Boolean), 'kind'),
        nodeLimited: group.slugs.length > nodeLimit,
        nodes: group.slugs.slice(0, nodeLimit).map((slug) => summarizeNode(nodeBySlug.get(slug))),
      })),
    };
  }

  function componentGroupOnlyHasKinds(group, ignoredKinds) {
    if (!group || !Array.isArray(group.slugs) || group.slugs.length === 0) return false;
    return group.slugs.every((slug) => {
      const node = nodeBySlug.get(slug);
      return node && ignoredKinds.has(node.kind);
    });
  }

  function communities(options = {}) {
    const limit = normalizeLimit(options.limit, 20);
    const nodeLimit = normalizeLimit(options.nodeLimit, 25, 'nodeLimit');
    const iterations = normalizeIterations(options.iterations);
    const typeSet = normalizeTypes(options.types);
    const adjacency = undirectedAdjacencyFrom(nodes, edges, typeSet);
    const labels = propagateCommunityLabels(adjacency, iterations);
    const { groups, communityBySlug, crossCommunityEdges } = groupCommunities({
      nodes, edges, labels, typeSet, nodeBySlug,
    });

    return {
      operation: 'communities',
      parameters: {
        types: typeSet ? [...typeSet].sort() : null,
        iterations,
        limit,
        nodeLimit,
      },
      summary: {
        communities: groups.length,
        largestSize: groups[0]?.size || 0,
        singletonCount: groups.filter((group) => group.size === 1).length,
        crossCommunityEdges: crossCommunityEdges.length,
      },
      limited: groups.length > limit,
      communities: groups.slice(0, limit).map((group, index) => ({
        id: index + 1,
        label: group.label,
        size: group.size,
        internalEdges: group.internalEdges,
        boundaryEdges: group.boundaryEdges,
        kinds: group.kinds,
        domains: group.domains,
        representative: group.representative,
        nodeLimited: group.slugs.length > nodeLimit,
        nodes: group.slugs.slice(0, nodeLimit).map((slug) => summarizeNode(nodeBySlug.get(slug))),
      })),
      crossCommunityEdges: {
        total: crossCommunityEdges.length,
        limited: crossCommunityEdges.length > limit,
        rows: crossCommunityEdges.slice(0, limit).map((edge) => ({
          ...formatPathEdge(edge, edge.from, edge.to),
          fromCommunity: communityBySlug.get(edge.from),
          toCommunity: communityBySlug.get(edge.to),
        })),
      },
    };
  }

  function similarNodes(options = {}) {
    const limit = normalizeLimit(options.limit, 10);
    const typeSet = normalizeTypes(options.types);
    const sourceSlug = normalizeOptionalString(options.slug, 'slug');
    const resolvedSource = sourceSlug ? resolve(sourceSlug, 'slug') : null;
    const sourceNode = resolvedSource ? nodeBySlug.get(resolvedSource) : null;
    const candidate = sourceNode || {
      slug:
        normalizeOptionalString(options.candidateSlug, 'candidateSlug') ||
        normalizeOptionalString(options.title, 'title') ||
        '',
      kind: normalizeOptionalString(options.kind, 'kind'),
      title:
        normalizeOptionalString(options.title, 'title') ||
        normalizeOptionalString(options.candidateSlug, 'candidateSlug') ||
        '',
      domain: normalizeOptionalString(options.domain, 'domain'),
    };
    const sourceNeighbors = resolvedSource
      ? new Set(traversalEdges(resolvedSource, 'undirected', typeSet).map((row) => row.next))
      : new Set();
    const rows = [];

    for (const node of nodes) {
      if (resolvedSource && node.slug === resolvedSource) continue;
      const targetNeighbors = sourceNeighbors.size > 0 ? new Set(
        traversalEdges(node.slug, 'undirected', typeSet).map((row) => row.next),
      ) : sourceNeighbors;
      const score = similarityScore(candidate, node, sourceNeighbors, targetNeighbors);
      if (score.total <= 0) continue;
      rows.push({
        node: summarizeNode(node),
        score: roundScore(score.total),
        signals: {
          slug: roundScore(score.slug),
          title: roundScore(score.title),
          kind: roundScore(score.kind),
          domain: roundScore(score.domain),
          neighbors: roundScore(score.neighbors),
        },
        sharedNeighbors: [...(sourceNeighbors.size <= targetNeighbors.size ? sourceNeighbors : targetNeighbors)]
          .filter((slug) => sourceNeighbors.has(slug) && targetNeighbors.has(slug))
          .sort()
          .map((slug) => summarizeNode(nodeBySlug.get(slug))),
      });
    }

    rows.sort((a, b) => b.score - a.score || a.node.slug.localeCompare(b.node.slug));

    return {
      operation: 'similar_nodes',
      source: resolvedSource
        ? {
            mode: 'existing',
            slug: resolvedSource,
            node: summarizeNode(sourceNode),
          }
        : {
            mode: 'candidate',
            slug: candidate.slug || null,
            kind: candidate.kind || null,
            title: candidate.title || null,
            domain: candidate.domain || null,
          },
      parameters: {
        types: typeSet ? [...typeSet].sort() : null,
        limit,
      },
      totalMatches: rows.length,
      limited: rows.length > limit,
      matches: rows.slice(0, limit),
    };
  }

  return { components, communities, similarNodes, connectedComponentGroups, componentGroupOnlyHasKinds };
}
