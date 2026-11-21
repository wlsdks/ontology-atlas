import { createClusterQueries } from './cluster-queries.mjs';
import { createDomainMatrixQueries } from './domain-matrix-queries.mjs';
import { createGraphSummaryQueries } from './graph-summary-queries.mjs';
import { createMatchQueries } from './match-queries.mjs';
import { createProfileQueries } from './profile-queries.mjs';

/** The graph questions about the whole graph, filters, profiles, domain links and clusters, wired from the engine's shared state. */
export function createSelectionQueries({
  artifact,
  cliPrefix,
  nodes,
  edges,
  nodeBySlug,
  referencedOnlyByRef,
  outgoing,
  incoming,
  resolve,
  resolveWithGrowthHint,
  traversalEdges,
  aliasesFor,
  collectContainmentScope,
  collectLineage,
  compareNodeRows,
  compareEdges,
  containmentChildren,
  containmentParentsFor,
  countBy,
  degreeBucket,
  domainMapRow,
  formatCompiledEdge,
  intersectSlugSets,
  limitedNodeList,
  nearbySchemaPatterns,
  nearestDomainFor,
  normalizeEdgeTargetKind,
  normalizeIterations,
  normalizeMatchEdgesTypes,
  normalizeNodeKind,
  normalizeNodeSort,
  normalizeNonNegativeInteger,
  normalizeOptionalString,
  partitionScopeEdges,
  profileEdgeGroup,
  propagateCommunityLabels,
  publicRelationCountObject,
  publicRelationTypes,
  resolveDomainRoot,
  resolveProjectRoot,
  roundScore,
  schemaPatterns,
  scopeEdgeGroup,
  similarityScore,
  sortedNodesInScope,
  topHubs,
  undirectedAdjacencyFrom,
  writeRelationType,
}) {
  const { overview, schema, facets } = createGraphSummaryQueries({
    artifact, nodes, edges, referencedOnlyByRef, countBy, degreeBucket, schemaPatterns, topHubs,
  });
  const { matchNodes, matchEdges, relationCheck } = createMatchQueries({
    cliPrefix, edges, nodes, nodeBySlug, resolve, compareEdges, compareNodeRows, formatCompiledEdge,
    nearbySchemaPatterns, normalizeEdgeTargetKind, normalizeMatchEdgesTypes, normalizeNodeKind,
    normalizeNodeSort, normalizeNonNegativeInteger, normalizeOptionalString, publicRelationTypes,
    schemaPatterns, writeRelationType,
  });
  const { nodeProfile, domainProfile, projectScope, projectMap } = createProfileQueries({
    nodeBySlug, outgoing, incoming, resolveWithGrowthHint, aliasesFor, collectContainmentScope,
    collectLineage, compareEdges, containmentChildren, containmentParentsFor, countBy, domainMapRow,
    intersectSlugSets, limitedNodeList, partitionScopeEdges, profileEdgeGroup, resolveDomainRoot,
    resolveProjectRoot, scopeEdgeGroup, sortedNodesInScope, topHubs,
  });
  const { domainMatrix } = createDomainMatrixQueries({
    nodes, edges, nodeBySlug, collectContainmentScope, nearestDomainFor, normalizeOptionalString,
    publicRelationCountObject, publicRelationTypes, resolveProjectRoot, sortedNodesInScope,
  });
  const {
    components, communities, similarNodes, connectedComponentGroups, componentGroupOnlyHasKinds,
  } = createClusterQueries({
    nodes, edges, nodeBySlug, resolve, traversalEdges, countBy, normalizeIterations,
    normalizeOptionalString, propagateCommunityLabels, roundScore, similarityScore,
    undirectedAdjacencyFrom,
  });

  return {
    overview, schema, facets, matchNodes, matchEdges, relationCheck, nodeProfile,
    domainProfile, domainMatrix, projectScope, projectMap, components, communities, similarNodes,
    connectedComponentGroups, componentGroupOnlyHasKinds,
  };
}
