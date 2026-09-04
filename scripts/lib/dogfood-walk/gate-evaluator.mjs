// Evaluates a dogfood MCP walk response set against the expected shapes and
// produces the ordered list of gate failures (empty = pass).
// Split out of scripts/dogfood-mcp-walk.mjs (structural decomposition, logic unchanged).
import {
  analyzeRepoStructureFailure,
  batchCapFailure,
  batchRowIsolationFailure,
  compileIndexesFailure,
  compileSummaryFailure,
  destructiveDryRunFailure,
  inferImportsFailure,
  initializeInstructionsFailure,
  listConceptsFailure,
  listKindsFailure,
  overviewFailure,
  projectMapQueryPlanFailure,
  strictAddRelationFailure,
  strictArgsFailure,
  strictEnumFailure,
  strictFindNeighborsTypeFailure,
  strictFindOrphansKindFailure,
  strictGraphKindFilterFailure,
  strictListConceptsKindFailure,
  strictMaintenanceFilterFailure,
  strictMatchEdgesTypeFailure,
  strictMatchNodesSortFailure,
  strictMultiArgsFailure,
  strictQueryConceptsFilterFailure,
  strictRecommendRelationsKindFilterFailure,
  strictRelationCheckFailure as verifyStrictRelationCheckFailure,
  strictRelationFilterFailure,
  strictUnknownToolFailure,
  structuredContentParityStatus,
  toolsListInventoryFailure,
  toolsListSchemaFailure,
  validateVaultFailure,
  validationCodeSummary,
  formatCount,
  workspaceBriefSummary,
} from "../../../mcp/scripts/verify.mjs";
import {
  domainMatrixShapeFailure,
  domainProfileShapeFailure,
  allPathsPlanShapeFailure,
  allPathsShapeFailure,
  componentsShapeFailure,
  evidenceShapeFailure,
  getConceptsShapeFailure,
  neighborsShapeFailure,
  patternWalkShapeFailure,
  projectMapShapeFailure,
  projectScopeShapeFailure,
  queryPathShapeFailure,
  recordStructuredContentFailure,
  relationCheckShapeFailure,
  structuredContentMismatchFailure,
} from "./shape-validators-query.mjs";
import {
  growthPlanShapeFailure,
  maintenancePlanMissingCursorShapeFailure,
  maintenancePlanShapeFailure,
  recommendRelationsShapeFailure,
} from "./shape-validators-plans.mjs";
import {
  blastRadiusShapeFailure,
  containmentTreeShapeFailure,
  cyclesShapeFailure,
  impactShapeFailure,
  lineageShapeFailure,
  reachabilityShapeFailure,
  subgraphShapeFailure,
  topologicalOrderShapeFailure,
} from "./shape-validators-graph-structure.mjs";
import {
  centralityShapeFailure,
  communitiesShapeFailure,
  explainRelationShapeFailure,
  facetsShapeFailure,
  matchEdgesShapeFailure,
  matchNodesShapeFailure,
  nodeProfileShapeFailure,
  schemaShapeFailure,
  similarNodesShapeFailure,
} from "./shape-validators-graph-analytics.mjs";
import {
  blockingNextActions,
  crossToolConsistencyFailures,
  failedHealthChecks,
  healthShapeFailureForDogfood,
  healthStatusSummary,
  matchesShapeFailure,
  orphansShapeFailure,
  pathShapeFailure,
  workspaceBriefShapeFailure,
} from "./shape-validators-workspace.mjs";

// Semantic qualification is intentionally fail-closed in the product
// response: an unqualified project reports `needs_attention` and a
// `meaning_assessment` warning. The dogfood walk verifies the transport and
// structural contracts; it must not turn that honest semantic advisory into a
// release failure (nor hide any structural/validation failure). Keep this
// allow-list tiny and explicit so new warning kinds remain blocking until the
// gate receives a deliberate contract update.
const NON_BLOCKING_ADVISORY_CHECKS = new Set(["meaning_assessment"]);
const NON_BLOCKING_ADVISORY_ACTIONS = new Set(["meaning_assessment"]);


// The public `mcp-verify` warns on warning-level vault diagnostics and fails
// only on errors (2026-09-04, matching `validate`). The dogfood walk is this
// repository's own release gate: its vault must carry no warning at all, so
// the stricter reading lives here and nowhere else.
function dogfoodVaultWarningsFailure(list) {
  const warnings = list?.vaultWarnings;
  if (!warnings || !Number.isInteger(warnings.warningCount) || warnings.warningCount === 0) return null;
  return `list_concepts vaultWarnings present: errors ${warnings.errorCount}, warnings ${warnings.warningCount}. Run validate_vault for file-level diagnostics before writing.`;
}

function dogfoodValidateVaultFailure(validation) {
  const summary = validation?.summary;
  if (!summary || !Number.isInteger(summary.problemFiles) || summary.problemFiles === 0) return null;
  const codeSummary = validationCodeSummary(summary.byCode ?? {});
  const suffix = codeSummary ? ` · codes ${codeSummary}` : "";
  return `validate_vault found ${formatCount(summary.problemFiles, "problem file")}: errors ${summary.errorFiles}, warnings ${summary.warningFiles}${suffix}`;
}

function isAdvisoryOnlyChecks(checks) {
  return Array.isArray(checks) && checks.length > 0 && checks.every((check) => (
    check?.status === "pass" ||
    check?.status === "info" ||
    (check?.status === "warn" && NON_BLOCKING_ADVISORY_CHECKS.has(check?.id))
  ));
}

function isAdvisoryOnlyStatus(result, checks) {
  return result?.status !== "healthy" && isAdvisoryOnlyChecks(checks);
}

function nonAdvisoryNextActions(actions) {
  return blockingNextActions(actions).filter((label) => {
    const id = String(label).split(":", 1)[0];
    return !NON_BLOCKING_ADVISORY_ACTIONS.has(id);
  });
}

export function recordResult(failures, label, result) {
  if (!result) {
    failures.push(`${label}: missing response`);
    return false;
  }
  if (result.error) {
    failures.push(`${label}: ${result.error.message || JSON.stringify(result.error)}`);
    return false;
  }
  if (result.rawText) {
    failures.push(`${label}: non-JSON response`);
    return false;
  }
  return true;
}

export function stderrWarningFailures(stderr) {
  return stderrWarningLines(stderr)
    .map((line) => `stderr warning: ${line}`);
}

export function stderrWarningLines(stderr) {
  if (!stderr) return [];
  return stderr
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /Warning:/.test(line));
}

export function evaluateDogfoodGate({
  targets,
  initialize,
  kinds,
  list,
  listStructured,
  batch,
  batchStructured,
  ev,
  evStructured,
  path,
  pathStructured,
  bl,
  blStructured,
  orph,
  orphStructured,
  queryConcepts,
  queryConceptsStructured,
  queryConceptsLimited,
  queryConceptsLimitedStructured,
  analyzedRepo,
  analyzedRepoStructured,
  inferredImports,
  inferredImportsStructured,
  renameDryRunRes,
  mergeDryRunRes,
  deleteDryRunRes,
  validation,
  validationStructured,
  brief,
  briefStructured,
  tunedBrief,
  tunedBriefStructured,
  health,
  healthStructured,
  tunedHealth,
  tunedHealthStructured,
  compiled,
  compiledStructured,
  compiledIndexes,
  compiledIndexesStructured,
  overview,
  overviewStructured,
  patternWalk,
  patternWalkStructured,
  allPaths,
  allPathsStructured,
  allPathsPlan,
  allPathsPlanStructured,
  projectMapPlan,
  projectMapPlanStructured,
  projectMap,
  projectMapStructured,
  domainProfile,
  domainProfileStructured,
  domainMatrix,
  domainMatrixStructured,
  components,
  componentsStructured,
  relationCheck,
  relationCheckStructured,
  maintenancePlan,
  maintenancePlanStructured,
  maintenancePlanMissingCursor,
  maintenancePlanMissingCursorStructured,
  growthPlan,
  growthPlanStructured,
  relationRecommendations,
  relationRecommendationsStructured,
  cycles,
  cyclesStructured,
  topologicalOrder,
  topologicalOrderStructured,
  lineage,
  lineageStructured,
  containmentTree,
  containmentTreeStructured,
  reachability,
  reachabilityStructured,
  impact,
  impactStructured,
  blastRadius,
  blastRadiusStructured,
  subgraph,
  subgraphStructured,
  schema,
  schemaStructured,
  facets,
  facetsStructured,
  matchNodes,
  matchNodesStructured,
  matchEdges,
  matchEdgesStructured,
  nodeProfile,
  nodeProfileStructured,
  centrality,
  centralityStructured,
  communities,
  communitiesStructured,
  similarNodes,
  similarNodesStructured,
  explainRelation,
  explainRelationStructured,
  neighbors,
  neighborsStructured,
  queryPath,
  queryPathStructured,
  projectScope,
  projectScopeStructured,
  projectProbe,
  projectProbeStructured,
  kindsStructured,
  strictArgs,
  strictMultiArgs,
  strictEnum,
  strictUnknownTool,
  strictMaintenancePhaseFilter,
  strictMaintenanceSeverityFilter,
  strictMaintenanceKindFilter,
  strictRelationFilter,
  strictFindNeighborsTypeFilter,
  strictFindOrphansKindFilter,
  strictFindOrphansExcludeKindFilter,
  strictQueryConceptsKindFilter,
  strictQueryConceptsHasKeyFilter,
  strictListConceptsKindFilter,
  strictRelationCheck,
  strictAddRelation,
  strictGraphKindFilter,
  strictRecommendRelationsKindFilter,
  strictRecommendRelationsUnsupportedKindFilter,
  strictMatchNodesSortFilter,
  strictMatchEdgesTypeFilter,
  strictGraphFromKindFilter,
  strictGraphToKindFilter,
  getConceptsBatchCap,
  addConceptsBatchCap,
  addRelationsBatchCap,
  addConceptsRowRepair,
  addConceptsRowRepairStructured,
  addRelationsRowRepair,
  addRelationsRowRepairStructured,
  toolsList,
}) {
  const failures = [];
  recordResult(failures, "initialize", initialize);
  recordResult(failures, "tools/list", toolsList);
  recordResult(failures, "list_kinds", kinds);
  recordResult(failures, "list_concepts", list);
  recordResult(failures, "get_concepts", batch);
  recordResult(failures, "find_evidence", ev);
  recordResult(failures, "find_path", path);
  recordResult(failures, "find_backlinks", bl);
  recordResult(failures, "find_orphans", orph);
  recordResult(failures, "query_concepts", queryConcepts);
  recordResult(failures, "query_concepts_limited", queryConceptsLimited);
  recordResult(failures, "analyze_repo_structure", analyzedRepo);
  recordResult(failures, "infer_imports", inferredImports);
  recordResult(failures, "validate_vault", validation);
  recordResult(failures, "workspace_brief", brief);
  recordResult(failures, "workspace_brief_tuned", tunedBrief);
  recordResult(failures, "health", health);
  recordResult(failures, "health_tuned", tunedHealth);
  recordResult(failures, "compile_ontology", compiled);
  recordResult(failures, "compile_ontology_indexes", compiledIndexes);
  recordResult(failures, "overview", overview);
  recordResult(failures, "pattern_walk", patternWalk);
  recordResult(failures, "all_paths", allPaths);
  recordResult(failures, "all_paths_query_plan", allPathsPlan);
  recordResult(failures, "project_map_query_plan", projectMapPlan);
  recordResult(failures, "project_map", projectMap);
  recordResult(failures, "domain_profile", domainProfile);
  recordResult(failures, "domain_matrix", domainMatrix);
  recordResult(failures, "components", components);
  recordResult(failures, "relation_check", relationCheck);
  recordResult(failures, "maintenance_plan", maintenancePlan);
  recordResult(failures, "maintenance_plan_missing_cursor", maintenancePlanMissingCursor);
  recordResult(failures, "growth_plan", growthPlan);
  recordResult(failures, "recommend_relations", relationRecommendations);
  recordResult(failures, "cycles", cycles);
  recordResult(failures, "topological_order", topologicalOrder);
  recordResult(failures, "lineage", lineage);
  recordResult(failures, "containment_tree", containmentTree);
  recordResult(failures, "reachability", reachability);
  recordResult(failures, "impact", impact);
  recordResult(failures, "blast_radius", blastRadius);
  recordResult(failures, "subgraph", subgraph);
  recordResult(failures, "schema", schema);
  recordResult(failures, "facets", facets);
  recordResult(failures, "match_nodes", matchNodes);
  recordResult(failures, "match_edges", matchEdges);
  recordResult(failures, "node_profile", nodeProfile);
  recordResult(failures, "centrality", centrality);
  recordResult(failures, "communities", communities);
  recordResult(failures, "similar_nodes", similarNodes);
  recordResult(failures, "explain_relation", explainRelation);
  recordResult(failures, "neighbors", neighbors);
  recordResult(failures, "path", queryPath);
  recordResult(failures, "project_scope", projectScope);
  recordResult(failures, "project_probe", projectProbe);

  const strictFailure = strictArgsFailure(strictArgs);
  if (strictFailure) failures.push(`strict_args: ${strictFailure}`);
  const strictMultiFailure = strictMultiArgsFailure(strictMultiArgs);
  if (strictMultiFailure) failures.push(`strict_multi_args: ${strictMultiFailure}`);
  const strictEnumError = strictEnumFailure(strictEnum);
  if (strictEnumError) failures.push(`strict_enum: ${strictEnumError}`);
  const strictUnknownToolError = strictUnknownToolFailure(strictUnknownTool);
  if (strictUnknownToolError) failures.push(`strict_unknown_tool: ${strictUnknownToolError}`);
  const strictMaintenancePhaseFilterError = strictMaintenanceFilterFailure(strictMaintenancePhaseFilter, "phases");
  if (strictMaintenancePhaseFilterError) failures.push(`strict_maintenance_phase_filter: ${strictMaintenancePhaseFilterError}`);
  const strictMaintenanceSeverityFilterError = strictMaintenanceFilterFailure(strictMaintenanceSeverityFilter, "severities");
  if (strictMaintenanceSeverityFilterError) failures.push(`strict_maintenance_severity_filter: ${strictMaintenanceSeverityFilterError}`);
  const strictMaintenanceKindFilterError = strictMaintenanceFilterFailure(strictMaintenanceKindFilter, "kinds");
  if (strictMaintenanceKindFilterError) failures.push(`strict_maintenance_kind_filter: ${strictMaintenanceKindFilterError}`);
  const strictRelationFilterError = strictRelationFilterFailure(strictRelationFilter);
  if (strictRelationFilterError) failures.push(`strict_relation_filter: ${strictRelationFilterError}`);
  const strictFindNeighborsTypeFilterError = strictFindNeighborsTypeFailure(strictFindNeighborsTypeFilter);
  if (strictFindNeighborsTypeFilterError) failures.push(`strict_find_neighbors_type_filter: ${strictFindNeighborsTypeFilterError}`);
  const strictFindOrphansKindFilterError = strictFindOrphansKindFailure(strictFindOrphansKindFilter);
  if (strictFindOrphansKindFilterError) failures.push(`strict_find_orphans_kind_filter: ${strictFindOrphansKindFilterError}`);
  const strictFindOrphansExcludeKindFilterError = strictFindOrphansKindFailure(strictFindOrphansExcludeKindFilter, { field: "excludeKinds items" });
  if (strictFindOrphansExcludeKindFilterError) failures.push(`strict_find_orphans_exclude_kind_filter: ${strictFindOrphansExcludeKindFilterError}`);
  const strictQueryConceptsKindFilterError = strictQueryConceptsFilterFailure(strictQueryConceptsKindFilter);
  if (strictQueryConceptsKindFilterError) failures.push(`strict_query_concepts_kind_filter: ${strictQueryConceptsKindFilterError}`);
  const strictQueryConceptsHasKeyFilterError = strictQueryConceptsFilterFailure(
    strictQueryConceptsHasKeyFilter,
    { field: "has key", received: "capabilties", suggestion: "capabilities" },
  );
  if (strictQueryConceptsHasKeyFilterError) failures.push(`strict_query_concepts_has_key_filter: ${strictQueryConceptsHasKeyFilterError}`);
  const strictListConceptsKindFilterError = strictListConceptsKindFailure(strictListConceptsKindFilter);
  if (strictListConceptsKindFilterError) failures.push(`strict_list_concepts_kind_filter: ${strictListConceptsKindFilterError}`);
  const strictRelationCheckError = verifyStrictRelationCheckFailure(strictRelationCheck);
  if (strictRelationCheckError) failures.push(`strict_relation_check: ${strictRelationCheckError}`);
  const strictAddRelationError = strictAddRelationFailure(strictAddRelation);
  if (strictAddRelationError) failures.push(`strict_add_relation: ${strictAddRelationError}`);
  const strictGraphKindFilterError = strictGraphKindFilterFailure(strictGraphKindFilter);
  if (strictGraphKindFilterError) failures.push(`strict_graph_kind_filter: ${strictGraphKindFilterError}`);
  const strictRecommendRelationsKindFilterError = strictRecommendRelationsKindFilterFailure(strictRecommendRelationsKindFilter);
  if (strictRecommendRelationsKindFilterError) {
    failures.push(`strict_recommend_relations_kind_filter: ${strictRecommendRelationsKindFilterError}`);
  }
  const strictRecommendRelationsUnsupportedKindFilterError = strictRecommendRelationsKindFilterFailure(
    strictRecommendRelationsUnsupportedKindFilter,
    { received: "domain", requireSuggestion: false },
  );
  if (strictRecommendRelationsUnsupportedKindFilterError) {
    failures.push(`strict_recommend_relations_unsupported_kind_filter: ${strictRecommendRelationsUnsupportedKindFilterError}`);
  }
  const strictMatchNodesSortFilterError = strictMatchNodesSortFailure(strictMatchNodesSortFilter);
  if (strictMatchNodesSortFilterError) {
    failures.push(`strict_match_nodes_sort_filter: ${strictMatchNodesSortFilterError}`);
  }
  const strictMatchEdgesTypeFilterError = strictMatchEdgesTypeFailure(strictMatchEdgesTypeFilter);
  if (strictMatchEdgesTypeFilterError) {
    failures.push(`strict_match_edges_type_filter: ${strictMatchEdgesTypeFilterError}`);
  }
  const strictGraphFromKindFilterError = strictGraphKindFilterFailure(strictGraphFromKindFilter, { field: "fromKind" });
  if (strictGraphFromKindFilterError) failures.push(`strict_graph_from_kind_filter: ${strictGraphFromKindFilterError}`);
  const strictGraphToKindFilterError = strictGraphKindFilterFailure(strictGraphToKindFilter, {
    field: "toKind",
    received: "externl",
    suggestion: "external",
  });
  if (strictGraphToKindFilterError) failures.push(`strict_graph_to_kind_filter: ${strictGraphToKindFilterError}`);
  const getConceptsBatchCapError = batchCapFailure(getConceptsBatchCap, "get_concepts", "slugs");
  if (getConceptsBatchCapError) failures.push(`get_concepts_batch_cap: ${getConceptsBatchCapError}`);
  const addConceptsBatchCapError = batchCapFailure(addConceptsBatchCap, "add_concepts", "concepts");
  if (addConceptsBatchCapError) failures.push(`add_concepts_batch_cap: ${addConceptsBatchCapError}`);
  const addRelationsBatchCapError = batchCapFailure(addRelationsBatchCap, "add_relations", "relations");
  if (addRelationsBatchCapError) failures.push(`add_relations_batch_cap: ${addRelationsBatchCapError}`);
  if (addConceptsRowRepair) {
    const addConceptsRowRepairError = batchRowIsolationFailure({ result: { content: [{ text: JSON.stringify(addConceptsRowRepair) }], structuredContent: addConceptsRowRepairStructured } }, "concepts", "add_concepts");
    if (addConceptsRowRepairError) failures.push(`add_concepts_row_repair: ${addConceptsRowRepairError}`);
    else recordStructuredContentFailure(failures, "add_concepts_row_repair", addConceptsRowRepair, addConceptsRowRepairStructured);
  }
  if (addRelationsRowRepair) {
    const addRelationsRowRepairError = batchRowIsolationFailure({ result: { content: [{ text: JSON.stringify(addRelationsRowRepair) }], structuredContent: addRelationsRowRepairStructured } }, "relations", "add_relations");
    if (addRelationsRowRepairError) failures.push(`add_relations_row_repair: ${addRelationsRowRepairError}`);
    else recordStructuredContentFailure(failures, "add_relations_row_repair", addRelationsRowRepair, addRelationsRowRepairStructured);
  }
  const initializeInstructionsError = initializeInstructionsFailure({ result: initialize });
  if (initializeInstructionsError) failures.push(`initialize: ${initializeInstructionsError}`);

  for (const [toolName, response] of [
    ["rename_concept", renameDryRunRes],
    ["merge_concepts", mergeDryRunRes],
    ["delete_concept", deleteDryRunRes],
  ]) {
    const failure = destructiveDryRunFailure(response, toolName);
    if (failure) failures.push(`${toolName}_dry_run: ${failure}`);
  }
  if (toolsList) {
    if (Array.isArray(toolsList.tools)) {
      const toolsInventoryFailure = toolsListInventoryFailure(toolsList.tools);
      if (toolsInventoryFailure) failures.push(`tools/list: ${toolsInventoryFailure}`);
    }
    const toolsListFailure = toolsListSchemaFailure(toolsList.tools);
    if (toolsListFailure) failures.push(`tools/list: ${toolsListFailure}`);
  }

  if (kinds) {
    const kindsFailure = listKindsFailure(kinds);
    if (kindsFailure) failures.push(kindsFailure);
    else recordStructuredContentFailure(failures, "list_kinds", kinds, kindsStructured);
  }
  if (list) {
    const listFailure = listConceptsFailure(list) ?? dogfoodVaultWarningsFailure(list);
    if (listFailure) failures.push(listFailure);
    else recordStructuredContentFailure(failures, "list_concepts", list, listStructured);
  }
  if (projectProbe) {
    const projectProbeFailure = listConceptsFailure(projectProbe);
    if (projectProbeFailure) failures.push(`project_probe: ${projectProbeFailure}`);
    let projectProbeOk = !projectProbeFailure;
    if (!projectProbeFailure && projectProbe.total < 1) {
      failures.push("project_probe response missing project node");
      projectProbeOk = false;
    }
    if (!projectProbeFailure) {
      const nonProject = (projectProbe.nodes || []).find((node) => node?.kind !== "project");
      if (nonProject) {
        failures.push(`project_probe returned non-project node: ${nonProject.slug || "(unknown)"}`);
        projectProbeOk = false;
      }
      const kindProjectCount = kinds?.byKind?.project;
      if (Number.isInteger(kindProjectCount) && projectProbe.total >= 1 && projectProbe.total !== kindProjectCount) {
        failures.push(`project_probe count mismatch — list_kinds project ${kindProjectCount}, probe ${projectProbe.total}`);
        projectProbeOk = false;
      }
      if (projectProbeOk) {
        recordStructuredContentFailure(failures, "project_probe", projectProbe, projectProbeStructured);
      }
    }
  }
  if (batch) {
    const batchFailure = getConceptsShapeFailure(batch, targets);
    if (batchFailure) failures.push(batchFailure);
    else recordStructuredContentFailure(failures, "get_concepts", batch, batchStructured);
  }
  if (ev) {
    const evidenceFailure = evidenceShapeFailure(ev);
    if (evidenceFailure) failures.push(evidenceFailure);
    else recordStructuredContentFailure(failures, "find_evidence", ev, evStructured);
  }
  if (path) {
    const pathFailure = pathShapeFailure(path);
    if (pathFailure) failures.push(pathFailure);
    else {
      recordStructuredContentFailure(failures, "find_path", path, pathStructured);
      if (!path.found) failures.push(`find_path: expected ${targets.capabilitySlug} → ${targets.pathTargetSlug} path`);
    }
  }
  if (bl) {
    const backlinksFailure = matchesShapeFailure("find_backlinks", bl);
    if (backlinksFailure) failures.push(backlinksFailure);
    else recordStructuredContentFailure(failures, "find_backlinks", bl, blStructured);
  }
  if (orph) {
    const orphansFailure = orphansShapeFailure(orph);
    if (orphansFailure) failures.push(orphansFailure);
    else recordStructuredContentFailure(failures, "find_orphans", orph, orphStructured);
  }
  if (queryConcepts) {
    const queryConceptsFailure = matchesShapeFailure("query_concepts", queryConcepts);
    if (queryConceptsFailure) failures.push(queryConceptsFailure);
    else recordStructuredContentFailure(failures, "query_concepts", queryConcepts, queryConceptsStructured);
  }
  if (queryConceptsLimited) {
    const queryConceptsLimitedFailure = matchesShapeFailure("query_concepts_limited", queryConceptsLimited);
    if (queryConceptsLimitedFailure) failures.push(queryConceptsLimitedFailure);
    else {
      if (queryConceptsLimited.limited !== true) failures.push("query_concepts_limited: expected limited=true");
      if ((queryConceptsLimited.matches || []).some((row) => row?.slug === targets.projectSlug)) {
        failures.push("query_concepts_limited: excluded project slug was returned");
      }
      recordStructuredContentFailure(failures, "query_concepts_limited", queryConceptsLimited, queryConceptsLimitedStructured);
    }
  }
  if (analyzedRepo) {
    const analyzedRepoFailure = analyzeRepoStructureFailure(analyzedRepo);
    if (analyzedRepoFailure) failures.push(analyzedRepoFailure);
    else recordStructuredContentFailure(failures, "analyze_repo_structure", analyzedRepo, analyzedRepoStructured);
  }
  if (inferredImports) {
    const inferredImportsFailure = inferImportsFailure(inferredImports);
    if (inferredImportsFailure) failures.push(inferredImportsFailure);
    else recordStructuredContentFailure(failures, "infer_imports", inferredImports, inferredImportsStructured);
  }
  if (validation) {
    const validationFailure = validateVaultFailure(validation) ?? dogfoodValidateVaultFailure(validation);
    if (validationFailure) failures.push(validationFailure);
    else recordStructuredContentFailure(failures, "validate_vault", validation, validationStructured);
  }
  let briefShapeFailure = null;
  if (brief) {
    briefShapeFailure = workspaceBriefShapeFailure(brief);
    if (briefShapeFailure) failures.push(briefShapeFailure);
  }
  let tunedBriefShapeFailure = null;
  if (tunedBrief) {
    tunedBriefShapeFailure = workspaceBriefShapeFailure(tunedBrief, "workspace_brief_tuned");
    if (tunedBriefShapeFailure) failures.push(tunedBriefShapeFailure);
  }
  let healthShapeFailure = null;
  if (health) {
    healthShapeFailure = healthShapeFailureForDogfood(health);
    if (healthShapeFailure) failures.push(healthShapeFailure);
  }
  let tunedHealthShapeFailure = null;
  if (tunedHealth) {
    tunedHealthShapeFailure = healthShapeFailureForDogfood(tunedHealth, "health_tuned");
    if (tunedHealthShapeFailure) failures.push(tunedHealthShapeFailure);
  }
  if (compiled) {
    const compileFailure = compileSummaryFailure(compiled);
    if (compileFailure) failures.push(compileFailure);
    else recordStructuredContentFailure(failures, "compile_ontology", compiled, compiledStructured);
  }
  if (compiledIndexes) {
    const compileIndexesError = compileIndexesFailure(compiledIndexes);
    if (compileIndexesError) failures.push(compileIndexesError);
    else recordStructuredContentFailure(failures, "compile_ontology_indexes", compiledIndexes, compiledIndexesStructured);
  }
  if (overview) {
    const overviewShapeFailure = overviewFailure(overview);
    if (overviewShapeFailure) failures.push(overviewShapeFailure);
  }
  if (patternWalk) {
    const patternWalkFailure = patternWalkShapeFailure(patternWalk, targets);
    if (patternWalkFailure) failures.push(patternWalkFailure);
  }
  let allPathsFailure = null;
  if (allPaths) {
    allPathsFailure = allPathsShapeFailure(allPaths, targets);
    if (allPathsFailure) failures.push(allPathsFailure);
  }
  let allPathsPlanFailure = null;
  if (allPathsPlan) {
    allPathsPlanFailure = allPathsPlanShapeFailure(allPathsPlan, targets);
    if (allPathsPlanFailure) failures.push(allPathsPlanFailure);
  }
  if (projectMapPlan) {
    const projectMapPlanFailure = projectMapQueryPlanFailure(projectMapPlan);
    if (projectMapPlanFailure) failures.push(projectMapPlanFailure);
  }
  if (projectMap) {
    const projectMapFailure = projectMapShapeFailure(projectMap, targets);
    if (projectMapFailure) failures.push(projectMapFailure);
  }
  if (domainProfile) {
    const domainProfileFailure = domainProfileShapeFailure(domainProfile, targets);
    if (domainProfileFailure) failures.push(domainProfileFailure);
  }
  if (domainMatrix) {
    const domainMatrixFailure = domainMatrixShapeFailure(domainMatrix, targets);
    if (domainMatrixFailure) failures.push(domainMatrixFailure);
  }
  if (components) {
    const componentsFailure = componentsShapeFailure(components);
    if (componentsFailure) failures.push(componentsFailure);
  }
  if (relationCheck) {
    const relationCheckFailure = relationCheckShapeFailure(relationCheck, targets);
    if (relationCheckFailure) failures.push(relationCheckFailure);
  }
  if (maintenancePlan) {
    const maintenancePlanFailure = maintenancePlanShapeFailure(maintenancePlan, { expectReadyCursor: true });
    if (maintenancePlanFailure) failures.push(maintenancePlanFailure);
  }
  if (maintenancePlanMissingCursor) {
    const maintenancePlanMissingCursorFailure = maintenancePlanMissingCursorShapeFailure(maintenancePlanMissingCursor);
    if (maintenancePlanMissingCursorFailure) failures.push(maintenancePlanMissingCursorFailure);
  }
  if (growthPlan) {
    const growthPlanFailure = growthPlanShapeFailure(growthPlan);
    if (growthPlanFailure) failures.push(growthPlanFailure);
  }
  if (relationRecommendations) {
    const relationRecommendationsFailure = recommendRelationsShapeFailure(relationRecommendations);
    if (relationRecommendationsFailure) failures.push(relationRecommendationsFailure);
  }
  if (cycles) {
    const cyclesFailure = cyclesShapeFailure(cycles);
    if (cyclesFailure) failures.push(cyclesFailure);
  }
  if (topologicalOrder) {
    const topologicalOrderFailure = topologicalOrderShapeFailure(topologicalOrder);
    if (topologicalOrderFailure) failures.push(topologicalOrderFailure);
  }
  if (lineage) {
    const lineageFailure = lineageShapeFailure(lineage, targets);
    if (lineageFailure) failures.push(lineageFailure);
  }
  if (containmentTree) {
    const containmentTreeFailure = containmentTreeShapeFailure(containmentTree, targets);
    if (containmentTreeFailure) failures.push(containmentTreeFailure);
  }
  if (reachability) {
    const reachabilityFailure = reachabilityShapeFailure(reachability, targets);
    if (reachabilityFailure) failures.push(reachabilityFailure);
  }
  if (impact) {
    const impactFailure = impactShapeFailure(impact, targets);
    if (impactFailure) failures.push(impactFailure);
  }
  if (blastRadius) {
    const blastRadiusFailure = blastRadiusShapeFailure(blastRadius, targets);
    if (blastRadiusFailure) failures.push(blastRadiusFailure);
  }
  if (subgraph) {
    const subgraphFailure = subgraphShapeFailure(subgraph, targets);
    if (subgraphFailure) failures.push(subgraphFailure);
  }
  if (schema) {
    const schemaFailure = schemaShapeFailure(schema);
    if (schemaFailure) failures.push(schemaFailure);
  }
  if (facets) {
    const facetsFailure = facetsShapeFailure(facets);
    if (facetsFailure) failures.push(facetsFailure);
  }
  if (matchNodes) {
    const matchNodesFailure = matchNodesShapeFailure(matchNodes, targets);
    if (matchNodesFailure) failures.push(matchNodesFailure);
  }
  if (matchEdges) {
    const matchEdgesFailure = matchEdgesShapeFailure(matchEdges, targets);
    if (matchEdgesFailure) failures.push(matchEdgesFailure);
  }
  if (nodeProfile) {
    const nodeProfileFailure = nodeProfileShapeFailure(nodeProfile, targets);
    if (nodeProfileFailure) failures.push(nodeProfileFailure);
  }
  if (centrality) {
    const centralityFailure = centralityShapeFailure(centrality);
    if (centralityFailure) failures.push(centralityFailure);
  }
  if (communities) {
    const communitiesFailure = communitiesShapeFailure(communities);
    if (communitiesFailure) failures.push(communitiesFailure);
  }
  if (similarNodes) {
    const similarNodesFailure = similarNodesShapeFailure(similarNodes, targets);
    if (similarNodesFailure) failures.push(similarNodesFailure);
  }
  if (explainRelation) {
    const explainRelationFailure = explainRelationShapeFailure(explainRelation, targets);
    if (explainRelationFailure) failures.push(explainRelationFailure);
  }
  if (neighbors) {
    const neighborsFailure = neighborsShapeFailure(neighbors, targets);
    if (neighborsFailure) failures.push(neighborsFailure);
  }
  if (queryPath) {
    const queryPathFailure = queryPathShapeFailure(queryPath, targets);
    if (queryPathFailure) failures.push(queryPathFailure);
  }
  if (projectScope) {
    const projectScopeFailure = projectScopeShapeFailure(projectScope, targets);
    if (projectScopeFailure) failures.push(projectScopeFailure);
  }
  if (allPaths && allPathsPlan && !allPathsFailure && !allPathsPlanFailure) {
    const plannedLimit = allPathsPlan.normalized.limit;
    if (allPaths.paths.length > plannedLimit) {
      failures.push(`all_paths query_plan limit below returned rows — rows ${allPaths.paths.length}, planned ${plannedLimit}`);
    }
  }
  const consistencyFailures = crossToolConsistencyFailures({ kinds, list, validation, compiled, overview });
  failures.push(...consistencyFailures);
  const briefChecks = brief?.health?.checks;
  if (brief && !briefShapeFailure && brief.status !== "healthy" && !isAdvisoryOnlyStatus(brief, briefChecks)) {
    failures.push(`workspace_brief: status ${brief.status} (${workspaceBriefSummary(brief)})`);
  }
  const briefFailedChecks = failedHealthChecks(brief?.health?.checks);
  if (briefFailedChecks.length > 0) {
    failures.push(`workspace_brief: failing health checks ${briefFailedChecks.join(", ")}`);
  }
  const blockingActions = nonAdvisoryNextActions(brief?.nextActions);
  if (blockingActions.length > 0) {
    failures.push(`workspace_brief: actionable nextActions ${blockingActions.join(", ")}`);
  }
  const tunedBriefChecks = tunedBrief?.health?.checks;
  if (tunedBrief && !tunedBriefShapeFailure && tunedBrief.status !== "healthy" && !isAdvisoryOnlyStatus(tunedBrief, tunedBriefChecks)) {
    failures.push(`workspace_brief_tuned: status ${tunedBrief.status} (${workspaceBriefSummary(tunedBrief)})`);
  }
  const tunedBriefFailedChecks = failedHealthChecks(tunedBrief?.health?.checks);
  if (tunedBriefFailedChecks.length > 0) {
    failures.push(`workspace_brief_tuned: failing health checks ${tunedBriefFailedChecks.join(", ")}`);
  }
  const tunedBlockingActions = nonAdvisoryNextActions(tunedBrief?.nextActions);
  if (tunedBlockingActions.length > 0) {
    failures.push(`workspace_brief_tuned: actionable nextActions ${tunedBlockingActions.join(", ")}`);
  }
  if (health && !healthShapeFailure && health.status !== "healthy" && !isAdvisoryOnlyStatus(health, health.checks)) {
    failures.push(`health: status ${health.status} (${healthStatusSummary(health)})`);
  }
  const healthFailedChecks = failedHealthChecks(health?.checks);
  if (healthFailedChecks.length > 0) {
    failures.push(`health: failing health checks ${healthFailedChecks.join(", ")}`);
  }
  if (tunedHealth && !tunedHealthShapeFailure && tunedHealth.status !== "healthy" && !isAdvisoryOnlyStatus(tunedHealth, tunedHealth.checks)) {
    failures.push(`health_tuned: status ${tunedHealth.status} (${healthStatusSummary(tunedHealth)})`);
  }
  const tunedHealthFailedChecks = failedHealthChecks(tunedHealth?.checks);
  if (tunedHealthFailedChecks.length > 0) {
    failures.push(`health_tuned: failing health checks ${tunedHealthFailedChecks.join(", ")}`);
  }

  for (const [label, parsed, structured] of [
    ["workspace_brief", brief, briefStructured],
    ["workspace_brief_tuned", tunedBrief, tunedBriefStructured],
    ["health", health, healthStructured],
    ["health_tuned", tunedHealth, tunedHealthStructured],
    ["overview", overview, overviewStructured],
    ["pattern_walk", patternWalk, patternWalkStructured],
    ["all_paths", allPaths, allPathsStructured],
    ["all_paths_query_plan", allPathsPlan, allPathsPlanStructured],
    ["project_map_query_plan", projectMapPlan, projectMapPlanStructured],
    ["project_map", projectMap, projectMapStructured],
    ["domain_profile", domainProfile, domainProfileStructured],
    ["domain_matrix", domainMatrix, domainMatrixStructured],
    ["components", components, componentsStructured],
    ["relation_check", relationCheck, relationCheckStructured],
    ["maintenance_plan", maintenancePlan, maintenancePlanStructured],
    ["maintenance_plan_missing_cursor", maintenancePlanMissingCursor, maintenancePlanMissingCursorStructured],
    ["growth_plan", growthPlan, growthPlanStructured],
    ["recommend_relations", relationRecommendations, relationRecommendationsStructured],
    ["cycles", cycles, cyclesStructured],
    ["topological_order", topologicalOrder, topologicalOrderStructured],
    ["lineage", lineage, lineageStructured],
    ["containment_tree", containmentTree, containmentTreeStructured],
    ["reachability", reachability, reachabilityStructured],
    ["impact", impact, impactStructured],
    ["blast_radius", blastRadius, blastRadiusStructured],
    ["subgraph", subgraph, subgraphStructured],
    ["schema", schema, schemaStructured],
    ["facets", facets, facetsStructured],
    ["match_nodes", matchNodes, matchNodesStructured],
    ["match_edges", matchEdges, matchEdgesStructured],
    ["node_profile", nodeProfile, nodeProfileStructured],
    ["centrality", centrality, centralityStructured],
    ["communities", communities, communitiesStructured],
    ["similar_nodes", similarNodes, similarNodesStructured],
    ["explain_relation", explainRelation, explainRelationStructured],
    ["neighbors", neighbors, neighborsStructured],
    ["path", queryPath, queryPathStructured],
    ["project_scope", projectScope, projectScopeStructured],
  ]) {
    const alreadyFailed = failures.some((failure) => failure.startsWith(`${label}:`) || failure.startsWith(`${label} `));
    if (!alreadyFailed && parsed) {
      const status = structuredContentParityStatus(parsed, structured);
      if (status === "missing") {
        failures.push(`${label} structuredContent missing`);
      } else if (status === "mismatch") {
        failures.push(structuredContentMismatchFailure(label, parsed, structured));
      }
    }
  }

  return failures;
}
