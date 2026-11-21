import { createContainmentQueries } from './containment-queries.mjs';
import { createContainmentScope } from './containment-scope.mjs';
import { createDependencyOrderQueries } from './dependency-order-queries.mjs';
import { createGrowthQueries } from './growth-queries.mjs';

/** The graph questions about containment, dependency order and what to grow next, wired from the engine's shared state. */
export function createScopeQueries({
  cliPrefix,
  nodes,
  edges,
  nodeBySlug,
  sourceDocFor,
  outgoing,
  resolve,
  pathNodes,
  ontologyAtlasIgnorePatterns,
  relationTypeForKey,
  bodyIsStarterTemplate,
  compareEdges,
  containmentChildren,
  containmentParentsFor,
  containmentTraversalEdges,
  findNearMatchSlug,
  formatCompiledEdge,
  hasResolvedContainmentParent,
  hasResolvedEdge,
  inferKindFromRelation,
  limitLayers,
  normalizeOptionalString,
  normalizeRecommendRelationKind,
  partitionScopeEdges,
  resolveOptional,
  sortLineageRows,
  suggestedSlugForReference,
  titleFromReference,
  topHubs,
  uniqueEdges,
}) {
  const {
    resolveProjectRoot, projectRootSlugs, resolveDomainRoot, collectContainmentScope,
    nearestDomainFor, intersectSlugSets, sortedNodesInScope, domainMapRow, limitedNodeList,
  } = createContainmentScope({
    nodes, nodeBySlug, resolve, resolveOptional, containmentChildren, containmentParentsFor,
    partitionScopeEdges, topHubs,
  });
  const { lineage, containmentTree, collectLineage } = createContainmentQueries({
    nodes, nodeBySlug, resolve, containmentChildren, containmentTraversalEdges,
    normalizeOptionalString, projectRootSlugs, sortLineageRows, uniqueEdges,
  });
  const { cycles, topologicalOrder } = createDependencyOrderQueries({
    nodes, edges, outgoing, nodeBySlug, pathNodes, formatCompiledEdge, limitLayers,
  });
  const {
    recommendRelations, growthPlan, externalElementCandidates, danglingReferenceCandidates,
    unassignedNodeCandidates, emptyDomainCandidates, capabilityWithoutEvidenceCandidates,
    unearnedNodeCandidates,
  } = createGrowthQueries({
    cliPrefix, nodes, edges, nodeBySlug, sourceDocFor, ontologyAtlasIgnorePatterns,
    relationTypeForKey, bodyIsStarterTemplate, compareEdges, containmentChildren,
    containmentParentsFor, findNearMatchSlug, hasResolvedContainmentParent, hasResolvedEdge,
    inferKindFromRelation, normalizeRecommendRelationKind, resolveOptional,
    suggestedSlugForReference, titleFromReference,
  });

  return {
    lineage, containmentTree, cycles, topologicalOrder, recommendRelations, growthPlan,
    collectContainmentScope, collectLineage, domainMapRow, intersectSlugSets, nearestDomainFor,
    resolveDomainRoot, resolveProjectRoot, projectRootSlugs, sortedNodesInScope, limitedNodeList,
    externalElementCandidates, danglingReferenceCandidates, unassignedNodeCandidates,
    emptyDomainCandidates, capabilityWithoutEvidenceCandidates, unearnedNodeCandidates,
  };
}
