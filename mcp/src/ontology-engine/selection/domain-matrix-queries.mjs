import {
  normalizeLimit,
  normalizeTypes,
  sortedCountObject,
  summarizeNode,
} from '../query-operation/query-primitives.mjs';
import { assignNodesToDomains, tallyDomainEdges } from './domain-matrix-rules.mjs';

/** How the domains of a project, or of the whole graph, connect to one another. */
export function createDomainMatrixQueries({
  nodes,
  edges,
  nodeBySlug,
  collectContainmentScope,
  nearestDomainFor,
  normalizeOptionalString,
  publicRelationCountObject,
  publicRelationTypes,
  resolveProjectRoot,
  sortedNodesInScope,
}) {
  function domainMatrix(options = {}) {
    const limit = normalizeLimit(options.limit, 100);
    const project = normalizeOptionalString(options.project ?? options.slug, 'project');
    const typeSet = normalizeTypes(options.types);
    const scope = project
      ? collectContainmentScope(resolveProjectRoot(project))
      : new Set(nodes.map((node) => node.slug));
    const scopedNodes = sortedNodesInScope(scope);
    const domainSlugs = scopedNodes
      .filter((node) => node.kind === 'domain')
      .map((node) => node.slug);
    const domainStats = new Map(domainSlugs.map((slug) => [
      slug,
      {
        slug,
        node: summarizeNode(nodeBySlug.get(slug)),
        nodes: 0,
        outgoing: 0,
        incoming: 0,
        selfEdges: 0,
        externalEdges: 0,
        unresolvedEdges: 0,
      },
    ]));
    const { domainForNode, assignedNodes } = assignNodesToDomains({
      scopedNodes, scope, nearestDomainFor, domainStats,
    });
    const { connectionMap, selfDomainEdges, crossDomainEdges, externalEdges, unresolvedEdges } =
      tallyDomainEdges({ edges, scope, typeSet, domainForNode, domainStats });

    const connections = [...connectionMap.values()]
      .map((row) => ({
        from: row.from,
        to: row.to,
        count: row.count,
        byRelation: sortedCountObject(row.byRelation),
        byRelationType: publicRelationCountObject(row.byRelation),
        fromNode: summarizeNode(nodeBySlug.get(row.from)),
        toNode: summarizeNode(nodeBySlug.get(row.to)),
        examples: row.examples,
      }))
      .sort((a, b) => b.count - a.count || a.from.localeCompare(b.from) || a.to.localeCompare(b.to));

    return {
      operation: 'domain_matrix',
      project: project ? resolveProjectRoot(project) : null,
      filters: {
        types: typeSet ? [...typeSet].sort() : null,
        relationTypes: publicRelationTypes(typeSet),
      },
      summary: {
        domains: domainSlugs.length,
        nodes: scopedNodes.length,
        assignedNodes,
        unassignedNodes: scopedNodes.length - assignedNodes,
        crossDomainEdges,
        selfDomainEdges,
        externalEdges,
        unresolvedEdges,
      },
      domains: [...domainStats.values()].sort((a, b) => a.slug.localeCompare(b.slug)),
      connections: {
        total: connections.length,
        limited: connections.length > limit,
        rows: connections.slice(0, limit),
      },
    };
  }

  return { domainMatrix };
}
