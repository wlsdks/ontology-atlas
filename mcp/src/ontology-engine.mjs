import { fileURLToPath } from 'node:url';

import { createArtifactContext } from './ontology-engine/graph-context/artifact-context.mjs';
import { createContextOperations } from './ontology-engine/graph-context/context-operations.mjs';
import { createQueryPlanner } from './ontology-engine/query-operation/query-planner.mjs';
import { createClusterQueries } from './ontology-engine/selection/cluster-queries.mjs';
import { createDomainMatrixQueries } from './ontology-engine/selection/domain-matrix-queries.mjs';
import { createGraphSummaryQueries } from './ontology-engine/selection/graph-summary-queries.mjs';
import { createMatchQueries } from './ontology-engine/selection/match-queries.mjs';
import { createProfileQueries } from './ontology-engine/selection/profile-queries.mjs';
import { createContainmentQueries } from './ontology-engine/traversal/containment-queries.mjs';
import { createDependencyOrderQueries } from './ontology-engine/traversal/dependency-order-queries.mjs';
import { createGrowthQueries } from './ontology-engine/traversal/growth-queries.mjs';
import { createScopeLookups } from './ontology-engine/traversal/scope-lookups.mjs';
import { createMaintenanceQueries } from './ontology-engine/maintenance/maintenance-queries.mjs';
import { createBriefQueries } from './ontology-engine/briefs/brief-queries.mjs';
import { createHealthQuery } from './ontology-engine/maintenance/health-query.mjs';
import { builderFocusParam, normalizeBuilderFocusInput, normalizeCanvasPosition } from './ontology-engine/traversal/builder-focus.mjs';
import {
  buildDependencyImpactQualification,
  qualifyDeclaredDependencyEdges,
} from './ontology-engine/traversal/dependency-qualification.mjs';
import {
  pageRankScores,
  propagateCommunityLabels,
  roundScore,
  similarityScore,
  undirectedAdjacencyFrom,
} from './ontology-engine/traversal/graph-measures.mjs';
import { annotateMaintenanceAction, compareMaintenanceActions } from './ontology-engine/maintenance/maintenance-actions.mjs';
import {
  compareCentralityRows,
  compareNodeRows,
  degreeBucket,
  sortLineageRows,
  topHubs,
} from './ontology-engine/selection/node-ranking.mjs';
import {
  normalizeDependencyImpactTypes,
  normalizeEdgeTargetKind,
  normalizeIterations,
  normalizeMatchEdgesTypes,
  normalizeNodeKind,
  normalizeNodeSort,
  normalizeNonNegativeInteger,
  normalizeOptionalString,
  normalizePattern,
  normalizeRecommendRelationKind,
  normalizeStringSet,
  normalizeTraversalDirection,
} from './ontology-engine/query-operation/query-arguments.mjs';
import {
  compareEdges,
  countEdges,
  formatCompiledEdge,
  publicRelationCountObject,
  publicRelationTypes,
  uniqueEdges,
} from './ontology-engine/query-operation/query-primitives.mjs';
import { findNearMatchSlug, suggestedSlugForReference, titleFromReference } from './ontology-engine/maintenance/reference-repair.mjs';
import { limitLayers } from './ontology-engine/traversal/topology-shape.mjs';
import { dispatchOntologyQuery } from './ontology-engine/query-operation/query-dispatch.mjs';
import { createTraversalQueries } from './ontology-engine/traversal/traversal-queries.mjs';
import { createTraversalAnalysis } from './ontology-engine/traversal/traversal-analysis.mjs';
import {
  buildAgentBriefHandoffPrompt,
} from './ontology-engine/briefs/agent-responses.mjs';

import { defaultBody } from './schema.mjs';

/**
 * Is this body still the template add_concept writes? Whitespace-folded, and
 * true when the body merely contains the template's prose tail: boilerplate
 * plus one appended line still says nothing.
 */
function bodyIsStarterTemplate(kind, title, body) {
  if (typeof body !== 'string' || body.trim() === '') return false;
  let starter;
  try {
    starter = defaultBody(kind, title ?? '');
  } catch {
    return false;
  }
  const fold = (text) => text.replace(/\s+/g, ' ').trim();
  const tail = fold(starter.split('\n').slice(2).join('\n'));
  if (!tail) return false;
  return fold(body).includes(tail);
}

const DOWNWARD_CONTAINMENT_TYPES = new Set(['domains', 'capabilities', 'elements', 'contains']);
const UPWARD_CONTAINMENT_TYPES = new Set(['domain']);
const HEALTH_IGNORED_COMPONENT_KINDS = new Set(['vault-readme']);
const AGENT_WORKFLOW_GUIDE = Object.freeze({
  path: 'docs/AGENT-GRAPH-WORKFLOW.md',
  title: 'Agent Graph Workflow',
  description:
    'CLI-only use, MCP-connected use, graph DB differences, graph query packs, and verification checks.',
});
const AGENT_MODE_COMPARISON = Object.freeze([
  Object.freeze({
    id: 'cli_only',
    label: 'CLI-only',
    when: 'No MCP client is connected or the user wants terminal-only inspection.',
    gives: 'validate, workspace-brief, graph scans, graph DB pack, and fallback timing over the same local vault.',
  }),
  Object.freeze({
    id: 'mcp_connected',
    label: 'MCP-connected',
    when: 'Claude Code, Codex, Cursor, or another MCP client is registered and restarted.',
    gives: 'direct read/write tools, structured repair fields, result contracts, and write guardrails.',
  }),
  Object.freeze({
    id: 'graph_db_pack',
    label: 'Graph DB pack',
    when: 'The user wants database-style graph exploration without running a database server.',
    gives: 'bounded query plans, node/edge scans, domain matrix, path evidence, and proof follow-ups.',
  }),
  Object.freeze({
    id: 'setup_gate',
    label: 'Setup gate',
    when: 'Setup is unclear or the agent was opened from a separate codebase root.',
    gives: 'config repair commands, JSON readiness, performance timing, and restart guidance before edits.',
  }),
]);
const GRAPH_SCAN_PROOF_CHECKLIST = Object.freeze([
  Object.freeze({
    id: 'report_scan_scope',
    label: 'Report scan scope',
    evidence: ['totalMatches', 'limited', 'row count'],
  }),
  Object.freeze({
    id: 'prove_node_rows',
    label: 'Prove node rows',
    evidence: ['node_profile', 'blast_radius'],
  }),
  Object.freeze({
    id: 'prove_edge_rows',
    label: 'Prove edge rows',
    evidence: ['explain_relation', 'path', 'relation_check'],
  }),
  Object.freeze({
    id: 'prove_path_completeness',
    label: 'Prove path completeness',
    evidence: ['evidence.pathsComplete', 'totalPathsExact'],
  }),
]);
export {
  EDGE_TARGET_KIND_VALUES,
  NODE_KIND_VALUES,
  RELATION_TYPE_VALUES,
  WRITE_RELATION_TYPE_VALUES,
} from './ontology-engine/query-operation/query-values.mjs';
export { shareArtifact } from './ontology-engine/graph-context/artifact-context.mjs';
// Frontmatter key (edge.via) → the public relation `type` for dangling-reference
// hints; only `dependencies` differs (`depends_on`). The inverse of
// RELATION_KEY in tools/relation-keys.mjs.
const RELATION_TYPE_FOR_KEY = Object.freeze({
  dependencies: 'depends_on',
  relates: 'relates',
  contains: 'contains',
  describes: 'describes',
  domains: 'domains',
  capabilities: 'capabilities',
  elements: 'elements',
  domain: 'domain',
});
export const MAINTENANCE_PHASE_VALUES = Object.freeze(['validate', 'repair', 'link', 'materialize', 'review']);
export const MAINTENANCE_SEVERITY_VALUES = Object.freeze(['fail', 'warn', 'info']);
export const MAINTENANCE_KIND_VALUES = Object.freeze([
  'inspect_compile_issue',
  'break_dependency_cycle',
  'canonicalize_graph_arrays',
  'resolve_dangling_reference',
  'add_missing_relation',
  'materialize_external_element',
  'unassigned_node',
  'empty_domain',
  // Write-path only: a compiled snapshot cannot derive these two.
  //   - `separate_evidence_from_concept`: a file path in a meaning slot, which
  //     validate_vault exempts and the compiler would materialize as a node.
  //   - `fold_bulk_siblings`: provenance, which only the write path sees.
  'separate_evidence_from_concept',
  'fold_bulk_siblings',
  // A bridge that groups nothing: the construction rules can manufacture empty
  // buckets, so the reparenting condition is checked deterministically.
  'retire_unearned_node',
  // A capability that never reaches code: reported, not rejected.
  'capability_without_evidence',
  // Appended last: the README documents this enum in declaration order.
  //   - `rejudge_summary_membership`: a summary whose containment list changed after
  //     its description; only Git history separates the two clocks.
  'rejudge_summary_membership',
  'definition_missing',
  'boundary_missing',
  'epistemic_exclusion',
  'folder_only_evidence',
  'slug_outside_kind_folder',
  'uncertainty_missing',
  // An `init` starter beside real nodes. review/info and never executable: the
  // repair deletes somebody's file. Needs no bodies or root, so it always answers.
  'retire_starter_example',
]);
const MAINTENANCE_PHASES = new Set(MAINTENANCE_PHASE_VALUES);
const MAINTENANCE_SEVERITIES = new Set(MAINTENANCE_SEVERITY_VALUES);
const MAINTENANCE_KINDS = new Set(MAINTENANCE_KIND_VALUES);
export const QUERY_ONTOLOGY_OPERATIONS = Object.freeze([
  'neighbors',
  'path',
  'all_paths',
  'query_plan',
  'centrality',
  'communities',
  'similar_nodes',
  'explain_relation',
  'reachability',
  'pattern_walk',
  'impact',
  'blast_radius',
  'subgraph',
  'builder_context',
  'overview',
  'schema',
  'facets',
  'match_nodes',
  'match_edges',
  'node_profile',
  'domain_profile',
  'domain_matrix',
  'project_scope',
  'project_map',
  'relation_check',
  'components',
  'lineage',
  'containment_tree',
  'cycles',
  'topological_order',
  'recommend_relations',
  'growth_plan',
  'maintenance_plan',
  'agent_brief',
  'meaning_repair_review',
  'analysis_history',
  'analysis_record',
  'workspace_brief',
  'health',
]);
export const QUERY_PLAN_TARGET_OPERATIONS = Object.freeze(
  QUERY_ONTOLOGY_OPERATIONS.filter((operation) => (
    !['query_plan', 'meaning_repair_review', 'analysis_history', 'analysis_record'].includes(operation)
  )),
);

export function queryCompiledOntology(artifact, query = {}, options = {}) {
  return dispatchOntologyQuery(
    createOntologyEngine(artifact, options),
    query,
    QUERY_ONTOLOGY_OPERATIONS,
  );
}
/**
 * The runnable prefix of the "use this when MCP is unavailable" line. No
 * global `ontology-atlas` command exists, so the default is this repository's CLI entry
 * point derived from this file's location; a caller that knows its entry point
 * (the CLI passes `cliInvocation()`) supplies it.
 */
function defaultCliInvocation() {
  try {
    const entry = fileURLToPath(new URL('../../cli/src/index.mjs', import.meta.url));
    return `node ${/[\s"'$`\\]/.test(entry) ? `'${entry.replace(/'/g, "'\\''")}'` : entry}`;
  } catch {
    /*
     * Not loaded from a file (browser bundle, test harness): the relative path still
     * runs inside the repository, the value `cli/src/lib/self-invocation.mjs` uses.
     */
    return 'node cli/src/index.mjs';
  }
}

export function createOntologyEngine(artifact, options = {}) {
  const cliPrefix =
    typeof options.cliInvocation === 'string' && options.cliInvocation.trim()
      ? options.cliInvocation.trim()
      : defaultCliInvocation();
  const ontologyAtlasIgnorePatterns = Array.isArray(options.ontologyAtlasIgnorePatterns)
    ? options.ontologyAtlasIgnorePatterns
    : [];
  /** Write-gate findings since the last drain (`drainNodeEligibilityFindings`); empty for read-only callers. */
  const nodeEligibilityFindings = Array.isArray(options.nodeEligibilityFindings)
    ? options.nodeEligibilityFindings
    : [];
  /**
   * Summaries whose membership outran their description (`findStaleParentSummaries`),
   * injected because the comparison needs Git history. Empty outside a repository,
   * which reads as "not checked".
   */
  const staleSummaries = Array.isArray(options.staleSummaries) ? options.staleSummaries : [];
  const {
    nodes,
    edges,
    sourceDocFor,
    nodeBySlug,
    aliasToSlug,
    aliasesFor: indexedAliasesFor,
    referencedOnlyByRef,
    outgoing,
    incoming,
    resolve,
    resolveWithGrowthHint,
  } = createArtifactContext(artifact, options);

  let traversalEdges;
  const contextOperations = createContextOperations({
    artifact, edges, nodeBySlug, aliasToSlug, outgoing, incoming, indexedAliasesFor,
    traversalEdges: (...args) => traversalEdges(...args), formatCompiledEdge, compareEdges,
    publicRelationCountObject, downwardContainmentTypes: DOWNWARD_CONTAINMENT_TYPES,
    upwardContainmentTypes: UPWARD_CONTAINMENT_TYPES,
  });
  const {
    schemaPatterns, nearbySchemaPatterns, writeRelationType, resolvedEdgesBetween,
    commonNeighborRows, relationVerdict, patternLayer, traversalEstimate,
    containmentTraversalEdges, containmentChildren, containmentParentsFor, resolveOptional,
    hasResolvedEdge, hasResolvedContainmentParent, aliasesFor, profileEdgeGroup,
    scopeEdgeGroup, partitionScopeEdges, inferKindFromRelation, workspaceNextActions,
  } = contextOperations;

  const {
    resolveProjectRoot, projectRootSlugs, resolveDomainRoot, collectContainmentScope,
    nearestDomainFor, intersectSlugSets, sortedNodesInScope, domainMapRow, limitedNodeList,
  } = createScopeLookups({
    nodes, nodeBySlug, resolve, resolveOptional, containmentChildren, containmentParentsFor,
    partitionScopeEdges, topHubs,
  });

  const traversalQueries = createTraversalQueries({
    resolve,
    nodeBySlug,
    outgoing,
    incoming,
  });
  const { allPaths, filteredEdges, neighbors, path, pathNodes } = traversalQueries;
  traversalEdges = traversalQueries.traversalEdges;
  const queryPlan = createQueryPlanner({
    artifact,
    nodes,
    edges,
    nodeBySlug,
    resolve,
    filteredEdges,
    traversalEstimate,
    targetOperations: QUERY_PLAN_TARGET_OPERATIONS,
    normalizeDependencyImpactTypes,
    normalizeEdgeTargetKind,
    normalizeIterations,
    normalizeMatchEdgesTypes,
    normalizeNodeKind,
    normalizeNodeSort,
    normalizeNonNegativeInteger,
    normalizeOptionalString,
    normalizeTraversalDirection,
    publicRelationTypes,
  });

  const {
    centrality,
    explainRelation,
    reachability,
    patternWalk,
    impact,
    blastRadius,
    subgraph,
    builderContext,
  } = createTraversalAnalysis({
    artifact,
    nodes,
    edges,
    nodeBySlug,
    sourceDocFor,
    resolve,
    path,
    pathNodes,
    traversalEdges,
    buildDependencyImpactQualification,
    builderFocusParam,
    commonNeighborRows,
    compareCentralityRows,
    countBy: countEdges,
    nearestDomainFor,
    normalizeBuilderFocusInput,
    normalizeCanvasPosition,
    normalizeDependencyImpactTypes,
    normalizeIterations,
    normalizePattern,
    normalizeTraversalDirection,
    pageRankScores,
    patternLayer,
    qualifyDeclaredDependencyEdges,
    relationVerdict,
    resolvedEdgesBetween,
    roundScore,
    uniqueEdges,
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
    relationTypeForKey: RELATION_TYPE_FOR_KEY, bodyIsStarterTemplate, compareEdges,
    containmentChildren, containmentParentsFor, findNearMatchSlug, hasResolvedContainmentParent,
    hasResolvedEdge, inferKindFromRelation, normalizeRecommendRelationKind, resolveOptional,
    suggestedSlugForReference, titleFromReference,
  });

  const { overview, schema, facets } = createGraphSummaryQueries({
    artifact, nodes, edges, referencedOnlyByRef, countBy: countEdges, degreeBucket, schemaPatterns,
    topHubs,
  });
  const { matchNodes, matchEdges, relationCheck, similarNodes } = createMatchQueries({
    cliPrefix, edges, nodes, nodeBySlug, resolve, traversalEdges, compareEdges, compareNodeRows,
    formatCompiledEdge, nearbySchemaPatterns, normalizeEdgeTargetKind, normalizeMatchEdgesTypes,
    normalizeNodeKind, normalizeNodeSort, normalizeNonNegativeInteger, normalizeOptionalString,
    publicRelationTypes, roundScore, schemaPatterns, similarityScore, writeRelationType,
  });
  const { nodeProfile, domainProfile, projectScope, projectMap } = createProfileQueries({
    nodeBySlug, outgoing, incoming, resolveWithGrowthHint, aliasesFor, collectContainmentScope,
    collectLineage, compareEdges, containmentChildren, containmentParentsFor, countBy: countEdges,
    domainMapRow, intersectSlugSets, limitedNodeList, partitionScopeEdges, profileEdgeGroup,
    resolveDomainRoot, resolveProjectRoot, scopeEdgeGroup, sortedNodesInScope, topHubs,
  });
  const { domainMatrix } = createDomainMatrixQueries({
    nodes, edges, nodeBySlug, collectContainmentScope, nearestDomainFor, normalizeOptionalString,
    publicRelationCountObject, publicRelationTypes, resolveProjectRoot, sortedNodesInScope,
  });
  const { components, communities, connectedComponentGroups, componentGroupOnlyHasKinds } =
    createClusterQueries({
      nodes, edges, nodeBySlug, traversalEdges, countBy: countEdges, normalizeIterations,
      propagateCommunityLabels, undirectedAdjacencyFrom,
    });
  const { maintenancePlan } = createMaintenanceQueries({
    artifact, nodes, nodeBySlug, sourceDocFor, nodeEligibilityFindings, staleSummaries,
    maintenancePhases: MAINTENANCE_PHASES, maintenanceSeverities: MAINTENANCE_SEVERITIES,
    maintenanceKinds: MAINTENANCE_KINDS, capabilityWithoutEvidenceCandidates,
    compareMaintenanceActions, countBy: countEdges, cycles, danglingReferenceCandidates, emptyDomainCandidates,
    externalElementCandidates, normalizeStringSet, recommendRelations, unassignedNodeCandidates,
    unearnedNodeCandidates, annotateMaintenanceAction,
  });

  const { workspaceBrief, agentBrief } = createBriefQueries({
    cliPrefix, agentWorkflowGuide: AGENT_WORKFLOW_GUIDE,
    agentModeComparison: AGENT_MODE_COMPARISON, graphScanProofChecklist: GRAPH_SCAN_PROOF_CHECKLIST,
    nodeBySlug, nodes, edges, growthPlan, health: (...args) => health(...args), overview, projectMap,
    projectRootSlugs, resolve, workspaceNextActions,
  });

  const health = createHealthQuery({
    artifact, healthIgnoredComponentKinds: HEALTH_IGNORED_COMPONENT_KINDS,
    componentGroupOnlyHasKinds, components, connectedComponentGroups, cycles,
    overview, recommendRelations, topologicalOrder,
  });


  return {
    resolve,
    neighbors,
    path,
    allPaths,
    queryPlan,
    centrality,
    communities,
    similarNodes,
    explainRelation,
    reachability,
    patternWalk,
    impact,
    blastRadius,
    subgraph,
    builderContext,
    overview,
    schema,
    facets,
    matchNodes,
    matchEdges,
    nodeProfile,
    domainProfile,
    domainMatrix,
    projectScope,
    projectMap,
    relationCheck,
    components,
    lineage,
    containmentTree,
    cycles,
    topologicalOrder,
    recommendRelations,
    growthPlan,
    maintenancePlan,
    agentBrief,
    workspaceBrief,
    health,
  };
}

export function refreshAgentBriefHandoffPrompt(brief, options = {}) {
  const cliPrefix = typeof options.cliInvocation === 'string' && options.cliInvocation.trim()
    ? options.cliInvocation.trim()
    : defaultCliInvocation();
  return {
    ...brief,
    handoffPrompt: buildAgentBriefHandoffPrompt(brief, cliPrefix),
  };
}
