import { fileURLToPath } from 'node:url';

import { createArtifactContext } from './ontology-engine/artifact-context.mjs';
import { createContextOperations } from './ontology-engine/context-operations.mjs';
import { createQueryPlanner } from './ontology-engine/query-planner.mjs';
import { createSelectionQueries } from './ontology-engine/selection-queries.mjs';
import { createScopeQueries } from './ontology-engine/scope-queries.mjs';
import { createMaintenanceQueries } from './ontology-engine/maintenance-queries.mjs';
import { createBriefQueries } from './ontology-engine/brief-queries.mjs';
import { createHealthQuery } from './ontology-engine/health-query.mjs';
import {
  healthCheck,
  qualifyDeclaredDependencyEdges,
  buildDependencyImpactQualification,
  countBy,
  degreeBucket,
  topHubs,
  findNearMatchSlug,
  suggestedSlugForReference,
  titleFromReference,
  sortLineageRows,
  normalizeCycle,
  limitLayers,
  normalizeDependencyImpactTypes,
  normalizeMatchEdgesTypes,
  normalizePattern,
  normalizeOptionalString,
  normalizeNonNegativeInteger,
  normalizeRecommendRelationKind,
  normalizeNodeKind,
  normalizeEdgeTargetKind,
  normalizeNodeSort,
  compareNodeRows,
  pageRankScores,
  undirectedAdjacencyFrom,
  propagateCommunityLabels,
  similarityScore,
  compareCentralityRows,
  roundScore,
  compareMaintenanceActions,
  annotateMaintenanceAction,
  normalizeStringSet,
  normalizeIterations,
  publicRelationTypes,
  publicRelationCountObject,
  normalizeTraversalDirection,
  normalizeCanvasPosition,
  builderFocusParam,
  normalizeBuilderFocusInput,
  formatCompiledEdge,
  uniqueEdges,
  compareEdges,
} from './ontology-engine/engine-helpers.mjs';
import { dispatchOntologyQuery } from './ontology-engine/query-dispatch.mjs';
import { createTraversalQueries } from './ontology-engine/traversal-queries.mjs';
import { createTraversalAnalysis } from './ontology-engine/traversal-analysis.mjs';
import {
  buildAgentBriefHandoffPrompt,
} from './ontology-engine/agent-responses.mjs';

import { defaultBody } from './schema.mjs';

/**
 * Is this body still the template `add_concept` writes when no body is given?
 *
 * Compared with whitespace folded, and accepted when the body merely *contains*
 * the template's prose tail — an agent that kept the boilerplate and appended one
 * line has still not said anything, and an exact-match check would miss that.
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
} from './ontology-engine/query-values.mjs';
// dangling-reference correction hints (reason text only, no schema impact) —
// frontmatter key (edge.via) → the public `type` value `relate`/add_relation
// expect. Only 'dependencies' differs from its key ('depends_on'); rest are
// identity. Mirrors RELATION_KEY's inverse in mcp/src/index.js.
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
/**
 * Which nodes are **bridge-shaped** — a layer somebody inserted into the hierarchy.
 *
 * ## The rule, and why it is this one
 *
 * The four kinds nest flat: project → domain → capability → element. Nothing in
 * that chain ever puts a node next to another of its own kind. So *same-kind
 * containment adjacency* — a capability whose containment parent or child is also
 * a capability — happens only when someone inserted a grouping layer. That is the
 * whole predicate, and it needs no frontmatter key: forging a `bridge: true` flag
 * or dropping it during a hand edit are both possible, and neither is possible here.
 *
 * ## The candidate this replaced, and the measurement that replaced it
 *
 * A proposed second clause was "the parent is a capability and the children are all
 * elements". Read literally it is **vacuously true for every element in the vault**
 * — a leaf has no children, and "all of none are elements" holds. Measured on this
 * repo's own vault it matched 41 of 98 nodes, every one of them an ordinary leaf.
 * Requiring at least one child collapses it into the same-kind rule it sits beside,
 * because a node under a capability that has element children *is* a capability
 * under a capability. So the clause is dropped: it adds either 41 false positives
 * or nothing at all.
 *
 * `looksLikePath` misjudged an English prose title on its first real-vault run, and
 * a check that is wrong on debut is one people stop reading. This one was measured
 * on 98 real nodes and 3,000 synthetic ones before it shipped: zero false positives
 * on both.
 *
 * @param {{nodes?: Array, edges?: Array}} graph compiled artifact, or anything with
 *   the same `{slug, kind}` / `{from, to|ref, via, resolved}` shape — deliberately
 *   plain so the web renderer can mirror this function without importing `mcp/`.
 * @returns {Map<string, {via: 'same-kind-parent'|'same-kind-child', counterpart: string}>}
 *   keyed by slug; absent means "not bridge-shaped".
 */
export function deriveBridgeShapes(graph) {
  const nodes = Array.isArray(graph?.nodes) ? graph.nodes : [];
  const edges = Array.isArray(graph?.edges) ? graph.edges : [];
  const kindBySlug = new Map(nodes.map((node) => [node.slug, node.kind]));
  const shapes = new Map();

  const note = (slug, via, counterpart) => {
    if (kindBySlug.get(slug) !== kindBySlug.get(counterpart)) return;
    // A same-kind PARENT is the stronger statement — it says this node was pushed
    // down a level — so it wins when a node has both.
    if (via === 'same-kind-child' && shapes.has(slug)) return;
    shapes.set(slug, { via, counterpart });
  };

  for (const edge of edges) {
    if (edge?.resolved === false) continue;
    const target = edge?.to ?? edge?.ref;
    if (typeof edge?.from !== 'string' || typeof target !== 'string') continue;
    if (!kindBySlug.has(edge.from) || !kindBySlug.has(target)) continue;
    if (DOWNWARD_CONTAINMENT_TYPES.has(edge.via)) {
      note(target, 'same-kind-parent', edge.from);
      note(edge.from, 'same-kind-child', target);
    } else if (UPWARD_CONTAINMENT_TYPES.has(edge.via)) {
      note(edge.from, 'same-kind-parent', target);
      note(target, 'same-kind-child', edge.from);
    }
  }
  return shapes;
}

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
  // Node-eligibility gate, write path only (2026-07-31 council). These two
  // cannot be derived from a compiled snapshot, which is why they are separate
  // kinds rather than extra reasons on an existing one:
  //
  //   - `separate_evidence_from_concept` — a file path in a meaning slot. The
  //     vault validator *exempts* path-shaped `elements:` entries, and the
  //     compiler routes them to `materialize_external_element`, whose only
  //     prescription is "create one node per file". Between the two, the shape
  //     that was 100% of the measured defect (92/92 unresolved on one
  //     capability) had no channel that said "this does not belong here".
  //   - `fold_bulk_siblings` — provenance, not population. Five nodes a person
  //     wrote over a week and five one machine batch emitted look identical in
  //     a snapshot; only the write path saw which was which.
  'separate_evidence_from_concept',
  'fold_bulk_siblings',
  // A bridge node that groups nothing (2026-08-01 ledger extension). The
  // construction rules tell an LLM to insert a bridge when siblings are
  // interchangeable — so the rules themselves can manufacture empty buckets if
  // nothing checks the fourth condition ("you actually reparent the children").
  // Prompt text alone leaks on weaker models, so the check is deterministic and
  // vault-wide rather than a sentence.
  'retire_unearned_node',
  // A capability that never reaches code (2026-08-01 field trial). On a
  // 50-node vault an agent built from an unfamiliar repository, 8 of 16
  // capabilities carried an empty `elements:`, and the handoff agent — given
  // the vault without the source — could only answer "there is no code entry
  // point" for every one of them. The construction rules ask for evidence and
  // never blocked its absence, which is correct: blocking would make the vault
  // hostile. So the absence is not rejected, it is *reported*.
  'capability_without_evidence',
  // Appended last on purpose: the README documents this enum in declaration order,
  // and appending keeps that contract diff-legible instead of renumbering prose.
  //
  //   - `rejudge_summary_membership` — a domain or project whose containment list
  //     changed after its description was last written. Two clocks live in one file
  //     and a compiled snapshot sees neither; only Git history separates the
  //     judgement from the membership it judges.
  'rejudge_summary_membership',
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
 * The **runnable** prefix of the "use this when MCP is unavailable" line.
 *
 * **Why the default is an absolute path** (measured 2026-08-17): this slot used
 * to hold a bare `ontology-atlas`. **No global command by that name exists**
 * (registry publishing was abandoned — decision ledger, 2026-07-27), so pasting
 * it yields `command not found` — at the exact moment MCP is missing and this
 * line matters most.
 *
 * The same defect was fixed once in the graph-DB pack on 2026-07-29 (a comment in
 * `cli/src/commands/agent-brief.mjs`), but **this producer was not fixed**: one
 * repository held two places telling the same lie and only one was corrected.
 *
 * A caller that knows its own entry point supplies it (the CLI passes
 * `cliInvocation()`). With nothing supplied, the repository's CLI entry point is
 * derived from this file's location — not a guess, but a value that falls out of
 * **where this package lives**.
 */
function defaultCliInvocation() {
  try {
    const entry = fileURLToPath(new URL('../../cli/src/index.mjs', import.meta.url));
    return `node ${/[\s"'$`\\]/.test(entry) ? `'${entry.replace(/'/g, "'\\''")}'` : entry}`;
  } catch {
    /*
     * This module can be called from somewhere that is not a file (a browser
     * bundle, a test harness — there `import.meta.url` is not `file:` and the
     * conversion above throws). **It still lands on something runnable**: inside
     * the repository this relative path works as-is. Same value
     * `cli/src/lib/self-invocation.mjs` uses when it cannot determine the entry point.
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
  /**
   * Findings the write-path node-eligibility gate produced since the last drain
   * (`drainNodeEligibilityFindings` in `mcp/src/vault.mjs`). Empty for every
   * read-only caller — only a write response has anything to hand over.
   */
  const nodeEligibilityFindings = Array.isArray(options.nodeEligibilityFindings)
    ? options.nodeEligibilityFindings
    : [];
  /**
   * Summary nodes whose membership outran their description, from
   * `findStaleParentSummaries`. Injected for the same reason as the findings
   * above: the comparison needs Git history, which a compiled artifact does not
   * carry. Empty when the vault is not in a repository, which reads as "not
   * checked" rather than "clean".
   */
  const staleSummaries = Array.isArray(options.staleSummaries) ? options.staleSummaries : [];
  const {
    nodes,
    edges,
    sourceDocBySlug,
    nodeBySlug,
    aliasToSlug,
    referencedOnlyByRef,
    outgoing,
    incoming,
    resolve,
    resolveWithGrowthHint,
  } = createArtifactContext(artifact, options);

  let traversalEdges;
  const contextOperations = createContextOperations({
    artifact, edges, nodeBySlug, aliasToSlug, outgoing, incoming,
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
    sourceDocBySlug,
    resolve,
    path,
    pathNodes,
    traversalEdges,
    buildDependencyImpactQualification,
    builderFocusParam,
    commonNeighborRows,
    compareCentralityRows,
    countBy,
    nearestDomainFor: (...args) => nearestDomainFor(...args),
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

  const {
    overview, schema, facets, matchNodes, matchEdges, relationCheck, nodeProfile,
    domainProfile, domainMatrix, projectScope, projectMap, components, communities, similarNodes,
    connectedComponentGroups, componentGroupOnlyHasKinds,
  } = createSelectionQueries({
    artifact, cliPrefix, nodes, edges, nodeBySlug, referencedOnlyByRef, outgoing, incoming,
    resolve, resolveWithGrowthHint, traversalEdges,
    aliasesFor, collectContainmentScope: (...args) => collectContainmentScope(...args),
    collectLineage: (...args) => collectLineage(...args), compareNodeRows, compareEdges,
    containmentChildren: (...args) => containmentChildren(...args),
    containmentParentsFor: (...args) => containmentParentsFor(...args), countBy, degreeBucket,
    domainMapRow: (...args) => domainMapRow(...args), formatCompiledEdge,
    intersectSlugSets: (...args) => intersectSlugSets(...args),
    limitedNodeList: (...args) => limitedNodeList(...args), nearbySchemaPatterns,
    nearestDomainFor: (...args) => nearestDomainFor(...args),
    normalizeEdgeTargetKind, normalizeIterations, normalizeMatchEdgesTypes, normalizeNodeKind,
    normalizeNodeSort, normalizeNonNegativeInteger, normalizeOptionalString,
    partitionScopeEdges: (...args) => partitionScopeEdges(...args), profileEdgeGroup,
    propagateCommunityLabels, publicRelationCountObject, publicRelationTypes,
    resolveDomainRoot: (...args) => resolveDomainRoot(...args),
    resolveProjectRoot: (...args) => resolveProjectRoot(...args), roundScore, schemaPatterns,
    scopeEdgeGroup, similarityScore, sortedNodesInScope: (...args) => sortedNodesInScope(...args),
    topHubs, undirectedAdjacencyFrom, writeRelationType,
  });

  const {
    lineage, containmentTree, cycles, topologicalOrder, recommendRelations, growthPlan,
    collectContainmentScope, collectLineage, domainMapRow, intersectSlugSets, nearestDomainFor,
    resolveDomainRoot, resolveProjectRoot, projectRootSlugs, sortedNodesInScope, limitedNodeList,
    externalElementCandidates, danglingReferenceCandidates, unassignedNodeCandidates,
    emptyDomainCandidates, capabilityWithoutEvidenceCandidates, unearnedNodeCandidates,
  } = createScopeQueries({
    cliPrefix, nodes, edges, nodeBySlug, sourceDocBySlug, outgoing, resolve, pathNodes,
    ontologyAtlasIgnorePatterns, relationTypeForKey: RELATION_TYPE_FOR_KEY,
    bodyIsStarterTemplate, compareEdges, containmentChildren, containmentParentsFor,
    containmentTraversalEdges, findNearMatchSlug, formatCompiledEdge, hasResolvedContainmentParent,
    hasResolvedEdge, inferKindFromRelation, limitLayers, normalizeCycle, normalizeOptionalString,
    normalizeRecommendRelationKind, partitionScopeEdges, resolveOptional, sortLineageRows, suggestedSlugForReference, titleFromReference,
    topHubs, uniqueEdges,
  });
  const { maintenancePlan } = createMaintenanceQueries({
    artifact, nodeBySlug, nodeEligibilityFindings, staleSummaries,
    maintenancePhases: MAINTENANCE_PHASES, maintenanceSeverities: MAINTENANCE_SEVERITIES,
    maintenanceKinds: MAINTENANCE_KINDS, capabilityWithoutEvidenceCandidates,
    compareMaintenanceActions, countBy, cycles, danglingReferenceCandidates, emptyDomainCandidates,
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
    componentGroupOnlyHasKinds, components, connectedComponentGroups, cycles, healthCheck,
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
