import {
  normalizeDepth,
  normalizeLimit,
  normalizeOptionalBoolean,
  normalizeSearchBudget,
  normalizeTypes,
  summarizeNode,
} from '../query-operation/query-primitives.mjs';
import { findDependencyCycles, layerByPrerequisites } from './dependency-order-rules.mjs';

/** Whether dependencies loop, and in what order they can be built. */
export function createDependencyOrderQueries({
  nodes,
  edges,
  outgoing,
  nodeBySlug,
  pathNodes,
  formatCompiledEdge,
  limitLayers,
}) {
  function cycles(options = {}) {
    const limit = normalizeLimit(options.limit, 20);
    const maxDepth = normalizeDepth(options.maxHops ?? options.depth, 8);
    const typeSet = normalizeTypes(options.types ?? ['dependencies'], options.typeName || 'types');
    const searchBudget = normalizeSearchBudget(options.searchBudget);
    const { shortest, totalCycles, expandedStates, truncatedByBudget } = findDependencyCycles({
      nodes, outgoing, typeSet, maxDepth, limit, searchBudget,
    });

    const complete = !truncatedByBudget && totalCycles <= limit;
    return {
      operation: 'cycles',
      relationTypes: typeSet ? [...typeSet].sort() : null,
      maxDepth,
      searchBudget,
      expandedStates,
      exhaustive: !truncatedByBudget,
      truncatedByBudget,
      totalCycles,
      totalCyclesExact: !truncatedByBudget,
      limited: totalCycles > shortest.length || truncatedByBudget,
      cycles: shortest.map((cycle) => ({
        id: cycle.key,
        length: cycle.nodes.length - 1,
        nodes: cycle.nodes,
        nodeSummaries: pathNodes(cycle.nodes),
        edges: cycle.edges.map(formatCompiledEdge),
      })),
      evidence: {
        status: complete ? 'complete' : 'partial',
        reason: truncatedByBudget ? 'search_budget' : totalCycles > limit ? 'limit' : 'complete',
        nextStep: complete ? 'use' : 'narrow',
        recommendation: complete
          ? 'Safe to treat totalCycles as complete for the requested bounds: zero means acyclic within maxDepth.'
          : truncatedByBudget
            ? 'Search budget hit before the graph was exhausted, so totalCycles is a lower bound and zero does NOT mean acyclic. Reduce maxHops, narrow types, or raise searchBudget.'
            : 'totalCycles is exact, but the list holds only the shortest cycles up to limit; raise limit to see the rest.',
        saferQuery: complete
          ? undefined
          : {
              operation: 'cycles',
              maxHops: maxDepth > 2 ? maxDepth - 2 : maxDepth,
              limit: Math.min(limit, 10),
              searchBudget: Math.min(searchBudget, 1000),
              types: typeSet ? [...typeSet].sort() : undefined,
            },
      },
    };
  }

  function topologicalOrder(options = {}) {
    const limit = normalizeLimit(options.limit, 100);
    const typeSet = normalizeTypes(options.types ?? ['dependencies'], options.typeName || 'types');
    const includeIsolated = normalizeOptionalBoolean(options.includeIsolated, 'includeIsolated', false);
    const { selectedEdges, slugCount, ordered: orderedSlugs, layers: layerSlugs, blocked: blockedSlugs } =
      layerByPrerequisites({ nodes, edges, typeSet, includeIsolated });
    const ordered = orderedSlugs.map(({ rank, slug }) => ({ rank, slug, node: summarizeNode(nodeBySlug.get(slug)) }));
    const layers = layerSlugs.map(({ rank, slugs }) => ({
      rank,
      nodes: slugs.map((slug) => summarizeNode(nodeBySlug.get(slug))),
    }));
    const blocked = blockedSlugs.map(({ slug, remainingInDegree }) => ({
      slug,
      remainingInDegree,
      node: summarizeNode(nodeBySlug.get(slug)),
    }));

    return {
      operation: 'topological_order',
      relationTypes: typeSet ? [...typeSet].sort() : null,
      prerequisiteFirst: true,
      includeIsolated,
      acyclic: blocked.length === 0,
      totalNodes: slugCount,
      orderedCount: ordered.length,
      selectedEdges: selectedEdges.length,
      limited: ordered.length > limit,
      order: ordered.slice(0, limit),
      layers: limitLayers(layers, limit),
      blocked,
    };
  }

  return { cycles, topologicalOrder };
}
