// Human-readable console report for the dogfood MCP walk: runs the RPC batch,
// prints a header + status line per surface, evaluates the gate, and returns
// the process exit code.
// Split out of scripts/dogfood-mcp-walk.mjs (structural decomposition, logic unchanged).
import {
  compileIndexesSummary,
  destructiveDryRunFailure,
  formatCount,
  toolsListAnnotationSummary,
  toolsListInventoryFailure,
  toolsListSchemaFailure,
  workspaceBriefSummary,
} from "../../../mcp/scripts/verify.mjs";
import { COLORS } from "./colors.mjs";
import {
  dogfoodTimeoutErrorMessage,
  dogfoodUsage,
  parseDogfoodArgs,
  parseDogfoodTimeoutMs,
} from "./cli-args.mjs";
import {
  DOGFOOD_RESPONSE_LABELS,
  VAULT,
  getResult,
  getRpcResponse,
  getRpcResult,
  missingResponseLabels,
  rpc,
} from "./rpc-client.mjs";
import { buildDogfoodRequests } from "./request-builder.mjs";
import {
  batchNoWriteMetadataCoverageSummary,
  batchRowRepairSummary,
  batchWriteMetadataAbsenceSummary,
  componentSummary,
  formatWorkspaceNextActionRows,
  graphStructuredContentSummary,
  healthCheckStatusSummary,
  importModuleEdgeKindSummary,
  initializeInstructionStatus,
  maintenanceBucketSummary,
  maintenanceNextActionSummary,
  rpcTimeoutFailure,
  strictRepairSummary,
  structuredContentStatus,
  toolsListInventoryStatus,
  toolsListSchemaStatus,
  tunedHealthScopeSummary,
  tunedWorkspaceBriefScopeSummary,
  workspaceNextActionAnalysisLabel,
  workspaceNextActionSummary,
  writeMetadataAbsenceSummary,
  writeRowLabelGuidanceSummary,
} from "./summaries.mjs";
import {
  evaluateDogfoodGate,
  stderrWarningFailures,
  stderrWarningLines,
} from "./gate-evaluator.mjs";

const DOGFOOD_TIMEOUT_MS_RAW = process.env.OATLAS_DOGFOOD_TIMEOUT_MS;

function header(title) {
  console.log(
    `\n${COLORS.bold}${COLORS.cyan}━━ ${title} ━━${COLORS.reset}\n`,
  );
}

export async function runDogfoodWalk() {
  const args = parseDogfoodArgs();
  if (args.help) {
    console.log(dogfoodUsage());
    return 0;
  }
  if (args.error) {
    console.error(`${args.error}\n\n${dogfoodUsage()}`);
    return 2;
  }

  const timeoutMs = parseDogfoodTimeoutMs(DOGFOOD_TIMEOUT_MS_RAW);
  if (timeoutMs === false) {
    console.error(dogfoodTimeoutErrorMessage(DOGFOOD_TIMEOUT_MS_RAW));
    return 1;
  }

  console.log(
    `${COLORS.bold}AI agent dogfood walk${COLORS.reset} ${COLORS.dim}(vault=${VAULT})${COLORS.reset}`,
  );

  const requests = buildDogfoodRequests();

  const { responses, stderr, timedOut } = await rpc(requests, timeoutMs);
  const structuredContent = (id) => getRpcResult(responses, id)?.structuredContent;
  const initialize = getRpcResult(responses, 1);

  header("initialize — first-contact instructions");
  if (initialize) {
    console.log(`  server: ${initialize.serverInfo?.name || "unknown"}@${initialize.serverInfo?.version || "unknown"}`);
    console.log(`  instructions: ${initializeInstructionStatus(initialize, { color: true })}`);
  }

  header("tools/list — schema contract");
  const toolsList = getRpcResult(responses, 55);
  if (toolsList) {
    const tools = Array.isArray(toolsList.tools) ? toolsList.tools : [];
    const inventoryFailure = toolsListInventoryFailure(toolsList.tools);
    const schemaFailure = toolsListSchemaFailure(tools);
    console.log(`  tools: ${tools.length} (${toolsListAnnotationSummary(tools)})`);
    console.log(`  inventory: ${toolsListInventoryStatus(inventoryFailure, { color: true })}`);
    console.log(`  schema: ${toolsListSchemaStatus(schemaFailure, { color: true })}`);
    console.log(`  write row labels: ${writeRowLabelGuidanceSummary(tools)}`);
  }

  // 1. list_kinds
  header("list_kinds — vault census");
  const kinds = getResult(responses, 2);
  const kindsStructured = getRpcResult(responses, 2)?.structuredContent ?? null;
  if (kinds) {
    console.log(`  total: ${kinds.total}`);
    console.log(`  structuredContent: ${structuredContentStatus(kinds, kindsStructured)}`);
    console.log(`  byKind:`);
    for (const [k, n] of Object.entries(kinds.byKind || {})) {
      console.log(`    ${k.padEnd(15)} ${n}`);
    }
  }

  // 2. list_concepts (preview)
  header("list_concepts — preview (top 8)");
  const list = getResult(responses, 3);
  const listStructured = getRpcResult(responses, 3)?.structuredContent ?? null;
  if (list) {
    console.log(`  total: ${list.total}`);
    console.log(`  structuredContent: ${structuredContentStatus(list, listStructured)}`);
    for (const node of (list.nodes || []).slice(0, 8)) {
      console.log(
        `  ${node.kind?.padEnd(13) || ""} ${(node.slug || "").padEnd(40)} ${node.title || ""}`,
      );
    }
    if (list.nodes && list.nodes.length > 8) {
      console.log(
        `  ${COLORS.dim}... 외 ${list.nodes.length - 8} 개${COLORS.reset}`,
      );
    }
    if (list.vaultWarnings) {
      console.log(
        `  ${COLORS.yellow}vault corruption: error ${list.vaultWarnings.errorCount} · warning ${list.vaultWarnings.warningCount}${COLORS.reset}`,
      );
    }
  }

  // 2b. project probe
  header("project probe — list_concepts(kind=project)");
  const projectProbe = getResult(responses, 48);
  const projectProbeStructured = getRpcResult(responses, 48)?.structuredContent ?? null;
  if (projectProbe) {
    const projectSlugs = (projectProbe.nodes || []).map((node) => node.slug).join(", ") || "none";
    console.log(`  structuredContent: ${structuredContentStatus(projectProbe, projectProbeStructured)}`);
    console.log(`  ${formatCount(projectProbe.total ?? 0, "project node")} · ${projectSlugs}`);
  }

  // 3. get_concepts (batch reader + partial row)
  header("get_concepts — batch read + partial row");
  const batch = getResult(responses, 16);
  const batchStructured = getRpcResult(responses, 16)?.structuredContent ?? null;
  if (batch) {
    console.log(`  structuredContent: ${structuredContentStatus(batch, batchStructured)}`);
    for (const row of batch.concepts || []) {
      if (row.ok === false) {
        console.log(`  ${COLORS.yellow}missing${COLORS.reset} ${String(row.slug).padEnd(40)} ${row.error || ""}`);
      } else {
        console.log(
          `  ${(row.frontmatter?.kind || "").padEnd(13)} ${(row.slug || "").padEnd(40)} ${row.frontmatter?.title || ""}`,
        );
      }
    }
  }
  const getConceptsBatchCap = getRpcResponse(responses, 81);
  const addConceptsBatchCap = getRpcResponse(responses, 82);
  const addRelationsBatchCap = getRpcResponse(responses, 83);

  header("batch caps — reader/writer 51-row rejection");
  for (const [toolName, response] of [
    ["get_concepts", getConceptsBatchCap],
    ["add_concepts", addConceptsBatchCap],
    ["add_relations", addRelationsBatchCap],
  ]) {
    const text = response?.result?.content?.[0]?.text || "";
    console.log(`  ${toolName}: rejected ${response?.result?.isError === true}`);
    if (text) {
      console.log(`  ${text}`);
    }
  }

  header("batch row repair — invalid-only write smokes");
  const addConceptsRowRepair = getResult(responses, 85);
  const addConceptsRowRepairStructured = getRpcResult(responses, 85)?.structuredContent ?? null;
  const addRelationsRowRepair = getResult(responses, 86);
  const addRelationsRowRepairStructured = getRpcResult(responses, 86)?.structuredContent ?? null;
  for (const [toolName, payload, structuredPayload, key] of [
    ["add_concepts", addConceptsRowRepair, addConceptsRowRepairStructured, "concepts"],
    ["add_relations", addRelationsRowRepair, addRelationsRowRepairStructured, "relations"],
  ]) {
    console.log(`  ${toolName}: structuredContent ${structuredContentStatus(payload, structuredPayload)}`);
    console.log(`  ${toolName}: ${batchRowRepairSummary(payload?.[key])}`);
    console.log(`  ${toolName}: write metadata ${batchWriteMetadataAbsenceSummary(payload, structuredPayload, key)}`);
  }

  // 4. find_evidence
  header(`find_evidence(title="vault")`);
  const ev = getResult(responses, 4);
  const evStructured = getRpcResult(responses, 4)?.structuredContent ?? null;
  if (ev) {
    console.log(`  structuredContent: ${structuredContentStatus(ev, evStructured)}`);
    console.log(`  matches: ${ev.matches?.length || 0}`);
    for (const m of (ev.matches || []).slice(0, 5)) {
      console.log(`  ${m.kind?.padEnd(13) || ""} ${m.slug.padEnd(40)} (${m.matchedIn})`);
    }
  }

  // 5. find_path
  header(`find_path(capabilities/mcp-server → domains/vault-local-first)`);
  const path = getResult(responses, 5);
  const pathStructured = getRpcResult(responses, 5)?.structuredContent ?? null;
  if (path) {
    console.log(`  structuredContent: ${structuredContentStatus(path, pathStructured)}`);
    if (path.found) {
      console.log(`  hops: ${path.hopCount}`);
      console.log(`  ${path.hops.join(" → ")}`);
    } else {
      console.log(`  ${COLORS.yellow}경로 없음${COLORS.reset} — ${path.reason || ""}`);
    }
  }

  // 6. find_backlinks
  header(`find_backlinks(capabilities/mcp-server)`);
  const bl = getResult(responses, 6);
  const blStructured = getRpcResult(responses, 6)?.structuredContent ?? null;
  if (bl) {
    console.log(`  structuredContent: ${structuredContentStatus(bl, blStructured)}`);
    console.log(`  matches: ${bl.total}`);
    for (const m of (bl.matches || []).slice(0, 5)) {
      console.log(
        `  ${m.kind?.padEnd(13) || ""} ${m.slug.padEnd(40)} ${m.matchedKeys?.join(",") || ""}`,
      );
    }
  }

  // 7. find_orphans
  header(`find_orphans (어떤 backlink 도 없는 고립 노드)`);
  const orph = getResult(responses, 7);
  const orphStructured = getRpcResult(responses, 7)?.structuredContent ?? null;
  if (orph) {
    console.log(`  structuredContent: ${structuredContentStatus(orph, orphStructured)}`);
    console.log(`  total: ${orph.total}`);
    for (const m of (orph.orphans || []).slice(0, 8)) {
      console.log(`  ${m.kind?.padEnd(13) || ""} ${m.slug.padEnd(40)} ${m.title || ""}`);
    }
  }

  // 7b. query_concepts
  header(`query_concepts(kind=capability AND domain=ai-agent-partner)`);
  const queryConcepts = getResult(responses, 56);
  const queryConceptsStructured = getRpcResult(responses, 56)?.structuredContent ?? null;
  if (queryConcepts) {
    console.log(`  structuredContent: ${structuredContentStatus(queryConcepts, queryConceptsStructured)}`);
    console.log(`  matches: ${queryConcepts.matches?.length ?? 0} / total ${queryConcepts.total}`);
    for (const m of (queryConcepts.matches || []).slice(0, 5)) {
      console.log(`  ${m.kind?.padEnd(13) || ""} ${m.slug.padEnd(40)} ${m.title || ""}`);
    }
  }

  header(`query_concepts(slug!=project, limit=1)`);
  const queryConceptsLimited = getResult(responses, 60);
  const queryConceptsLimitedStructured = getRpcResult(responses, 60)?.structuredContent ?? null;
  if (queryConceptsLimited) {
    console.log(`  structuredContent: ${structuredContentStatus(queryConceptsLimited, queryConceptsLimitedStructured)}`);
    console.log(`  matches: ${queryConceptsLimited.matches?.length ?? 0} / total ${queryConceptsLimited.total} · limited ${queryConceptsLimited.limited === true}`);
    for (const m of (queryConceptsLimited.matches || []).slice(0, 3)) {
      console.log(`  ${m.kind?.padEnd(13) || ""} ${m.slug.padEnd(40)} ${m.title || ""}`);
    }
  }

  // 7c. analyze_repo_structure
  header(`analyze_repo_structure(repo bootstrap candidates)`);
  const analyzedRepo = getResult(responses, 57);
  const analyzedRepoStructured = getRpcResult(responses, 57)?.structuredContent ?? null;
  if (analyzedRepo) {
    console.log(`  structuredContent: ${structuredContentStatus(analyzedRepo, analyzedRepoStructured)}`);
    console.log(
      `  framework ${analyzedRepo.framework || "n/a"} · domains ${analyzedRepo.domains?.length ?? "n/a"} · capabilities ${analyzedRepo.capabilities?.length ?? "n/a"} · elements ${analyzedRepo.elements?.length ?? "n/a"} · relations ${analyzedRepo.suggestedRelations?.length ?? "n/a"}`,
    );
  }

  // 7d. infer_imports
  header(`infer_imports(repo dependency candidates)`);
  const inferredImports = getResult(responses, 58);
  const inferredImportsStructured = getRpcResult(responses, 58)?.structuredContent ?? null;
  if (inferredImports) {
    console.log(`  structuredContent: ${structuredContentStatus(inferredImports, inferredImportsStructured)}`);
    console.log(
      `  files ${inferredImports.filesScanned ?? "n/a"} · file edges ${inferredImports.edges?.length ?? "n/a"} · module edges ${inferredImports.moduleEdges?.length ?? "n/a"} · external ${inferredImports.externalImports?.length ?? "n/a"} · unresolved ${inferredImports.unresolved?.length ?? "n/a"}`,
    );
    console.log(`  top module edge kinds: ${importModuleEdgeKindSummary(inferredImports.moduleEdges)}`);
  }

  // 7e. destructive write previews
  header(`destructive dry-runs — preview only`);
  const renameDryRunRes = getRpcResponse(responses, 63);
  const mergeDryRunRes = getRpcResponse(responses, 64);
  const deleteDryRunRes = getRpcResponse(responses, 65);
  for (const [toolName, response] of [
    ["rename_concept", renameDryRunRes],
    ["merge_concepts", mergeDryRunRes],
    ["delete_concept", deleteDryRunRes],
  ]) {
    const failure = destructiveDryRunFailure(response, toolName);
    console.log(
      `  ${toolName}: ${
        failure
          ? `${COLORS.yellow}${failure}${COLORS.reset}`
          : `${COLORS.green}ok:false dryRun:true; no changed/postWriteMaintenance${COLORS.reset}`
      }`,
    );
  }

  // 8. validate_vault
  header(`validate_vault`);
  const validation = getResult(responses, 8);
  const validationStructured = getRpcResult(responses, 8)?.structuredContent ?? null;
  if (validation) {
    console.log(`  structuredContent: ${structuredContentStatus(validation, validationStructured)}`);
    console.log(
      `  ${formatCount(validation.scanned ?? 0, "file")} · ${formatCount(validation.summary?.problemFiles ?? 0, "problem file")} · errors ${validation.summary?.errorFiles ?? "n/a"} · warnings ${validation.summary?.warningFiles ?? "n/a"}`,
    );
    for (const problem of (validation.problems || []).slice(0, 5)) {
      const codes = (problem.issues || []).map((issue) => issue.code).join(",");
      console.log(`  ${problem.slug || "unknown"} ${codes}`);
    }
  }

  // 9. workspace_brief
  header(`query_ontology(workspace_brief)`);
  const brief = getResult(responses, 9);
  const briefStructured = structuredContent(9);
  if (brief) {
    console.log(`  structuredContent: ${structuredContentStatus(brief, briefStructured)}`);
    console.log(`  status: ${brief.status}`);
    console.log(
      `  summary: nodes ${brief.summary?.nodes ?? "n/a"} · edges ${brief.summary?.edges ?? "n/a"} · issues ${brief.summary?.issues ?? "n/a"}`,
    );
    console.log(`  ${workspaceBriefSummary(brief)}`);
    for (const row of formatWorkspaceNextActionRows(brief.nextActions)) {
      console.log(row);
    }
  }

  // 10. health
  header(`query_ontology(health)`);
  const health = getResult(responses, 10);
  const healthStructured = structuredContent(10);
  if (health) {
    console.log(`  structuredContent: ${structuredContentStatus(health, healthStructured)}`);
    console.log(`  status: ${health.status}`);
    console.log(
      `  summary: issues ${health.summary?.issues ?? "n/a"} · unresolved ${health.summary?.unresolvedEdges ?? "n/a"} · cycles ${health.summary?.dependencyCycles ?? "n/a"}`,
    );
    for (const check of health.checks || []) {
      console.log(`  ${check.status?.padEnd(6) || ""} ${check.id.padEnd(26)} ${check.count}`);
    }
  }

  // 10b. health tuned
  header(`query_ontology(health tuned)`);
  const tunedHealth = getResult(responses, 49);
  const tunedHealthStructured = structuredContent(49);
  if (tunedHealth) {
    console.log(`  structuredContent: ${structuredContentStatus(tunedHealth, tunedHealthStructured)}`);
    console.log(`  scope: ${tunedHealthScopeSummary()}`);
    console.log(`  status: ${tunedHealth.status}`);
    console.log(
      `  summary: issues ${tunedHealth.summary?.issues ?? "n/a"} · unresolved ${tunedHealth.summary?.unresolvedEdges ?? "n/a"} · cycles ${tunedHealth.summary?.dependencyCycles ?? "n/a"}`,
    );
    for (const check of tunedHealth.checks || []) {
      console.log(`  ${check.status?.padEnd(6) || ""} ${check.id.padEnd(26)} ${check.count}`);
    }
  }

  // 10c. workspace_brief tuned
  header(`query_ontology(workspace_brief tuned)`);
  const tunedBrief = getResult(responses, 50);
  const tunedBriefStructured = structuredContent(50);
  if (tunedBrief) {
    console.log(`  structuredContent: ${structuredContentStatus(tunedBrief, tunedBriefStructured)}`);
    console.log(`  scope: ${tunedWorkspaceBriefScopeSummary()}`);
    console.log(`  status: ${tunedBrief.status}`);
    console.log(
      `  summary: nodes ${tunedBrief.summary?.nodes ?? "n/a"} · edges ${tunedBrief.summary?.edges ?? "n/a"} · issues ${tunedBrief.summary?.issues ?? "n/a"}`,
    );
    console.log(`  ${workspaceBriefSummary(tunedBrief)}`);
    for (const row of formatWorkspaceNextActionRows(tunedBrief.nextActions)) {
      console.log(row);
    }
  }

  // 11. compile_ontology(summary)
  header(`compile_ontology(summary)`);
  const compiled = getResult(responses, 11);
  const compiledStructured = getRpcResult(responses, 11)?.structuredContent ?? null;
  if (compiled) {
    console.log(`  structuredContent: ${structuredContentStatus(compiled, compiledStructured)}`);
    console.log(`  graphHash: ${compiled.graphHash || "n/a"}`);
    console.log(
      `  nodes ${compiled.nodeCount ?? "n/a"} · edges ${compiled.edgeCount ?? "n/a"} · issues ${compiled.issueCount ?? "n/a"} · canonicalization ${compiled.canonicalizationActionCount ?? "n/a"}`,
    );
  }

  header(`compile_ontology(indexed full artifact)`);
  const compiledIndexes = getResult(responses, 62);
  const compiledIndexesStructured = getRpcResult(responses, 62)?.structuredContent ?? null;
  if (compiledIndexes) {
    console.log(`  structuredContent: ${structuredContentStatus(compiledIndexes, compiledIndexesStructured)}`);
    console.log(`  indexes: ${compileIndexesSummary(compiledIndexes)}`);
  }

  // 12. overview
  header(`query_ontology(overview)`);
  const overview = getResult(responses, 15);
  const overviewStructured = structuredContent(15);
  if (overview) {
    console.log(`  structuredContent: ${structuredContentStatus(overview, overviewStructured)}`);
    console.log(
      `  graph ${overview.graph?.graphHash?.slice(0, 12) ?? "n/a"} · nodes ${overview.graph?.nodes ?? "n/a"} · edges ${overview.graph?.edges ?? "n/a"} · hubs ${(overview.hubs || []).length}`,
    );
  }

  // 13. pattern_walk
  header(`query_ontology(pattern_walk project → domains → capabilities)`);
  const patternWalk = getResult(responses, 12);
  const patternWalkStructured = structuredContent(12);
  if (patternWalk) {
    console.log(`  structuredContent: ${structuredContentStatus(patternWalk, patternWalkStructured)}`);
    console.log(
      `  paths: ${patternWalk.paths?.rows?.length ?? "n/a"} / total ${patternWalk.paths?.total ?? "n/a"} · limited ${patternWalk.paths?.limited ?? "n/a"}`,
    );
    for (const row of (patternWalk.paths?.rows || []).slice(0, 5)) {
      console.log(`  ${row.path?.join(" → ") || row.end || "unknown"}`);
    }
  }

  // 14. all_paths
  header(`query_ontology(all_paths mcp-server → vault-local-first)`);
  const allPaths = getResult(responses, 13);
  const allPathsStructured = structuredContent(13);
  if (allPaths) {
    console.log(`  structuredContent: ${structuredContentStatus(allPaths, allPathsStructured)}`);
    console.log(
      `  paths: ${allPaths.paths?.length ?? "n/a"} / total ${allPaths.totalPaths ?? "n/a"} · limited ${allPaths.limited ?? "n/a"} · shortest ${allPaths.shortestHopCount ?? "n/a"}`,
    );
    for (const row of (allPaths.paths || []).slice(0, 3)) {
      const relationChain = row.edges?.map((edge) => edge.via).join(" → ") || "unknown";
      console.log(`  ${row.hops?.join(" → ") || "unknown"} (${relationChain})`);
    }
  }

  // 15. all_paths query_plan
  header(`query_ontology(query_plan all_paths mcp-server → vault-local-first)`);
  const allPathsPlan = getResult(responses, 14);
  const allPathsPlanStructured = structuredContent(14);
  if (allPathsPlan) {
    console.log(`  structuredContent: ${structuredContentStatus(allPathsPlan, allPathsPlanStructured)}`);
    console.log(
      `  strategy: ${allPathsPlan.estimate?.strategy ?? "n/a"} · limit ${allPathsPlan.normalized?.limit ?? "n/a"} · upper ${allPathsPlan.estimate?.resultUpperBound ?? "n/a"} · cost ${allPathsPlan.estimate?.costClass ?? "n/a"}`,
    );
    for (const warning of allPathsPlan.warnings || []) {
      console.log(`  warning: ${warning}`);
    }
  }

  // 16. project_map query_plan
  header(`query_ontology(query_plan project_map)`);
  const projectMapPlan = getResult(responses, 17);
  const projectMapPlanStructured = structuredContent(17);
  if (projectMapPlan) {
    console.log(`  structuredContent: ${structuredContentStatus(projectMapPlan, projectMapPlanStructured)}`);
    console.log(
      `  strategy: ${projectMapPlan.estimate?.strategy ?? "n/a"} · cost ${projectMapPlan.estimate?.costClass ?? "n/a"} · nodes ${projectMapPlan.estimate?.nodeScans ?? "n/a"} · edges ${projectMapPlan.estimate?.edgeScans ?? "n/a"}`,
    );
  }

  // 17. project_map
  header(`query_ontology(project_map)`);
  const projectMap = getResult(responses, 18);
  const projectMapStructured = structuredContent(18);
  if (projectMap) {
    console.log(`  structuredContent: ${structuredContentStatus(projectMap, projectMapStructured)}`);
    console.log(
      `  project ${projectMap.project ?? "n/a"} · domains ${projectMap.domains?.length ?? "n/a"} / total ${projectMap.summary?.domains ?? "n/a"} · capabilities ${projectMap.summary?.capabilities ?? "n/a"} · elements ${projectMap.summary?.elements ?? "n/a"}`,
    );
    for (const domain of (projectMap.domains || []).slice(0, 5)) {
      console.log(
        `  ${domain.slug}: ${domain.capabilities?.total ?? "n/a"} capabilities · ${domain.elements?.total ?? "n/a"} elements`,
      );
    }
  }

  // 18. domain_profile
  header(`query_ontology(domain_profile ai-agent-partner)`);
  const domainProfile = getResult(responses, 19);
  const domainProfileStructured = structuredContent(19);
  if (domainProfile) {
    console.log(`  structuredContent: ${structuredContentStatus(domainProfile, domainProfileStructured)}`);
    console.log(
      `  domain ${domainProfile.domain ?? "n/a"} · capabilities ${domainProfile.capabilities?.total ?? "n/a"} · elements ${domainProfile.elements?.total ?? "n/a"} · boundary ${domainProfile.edges?.boundary?.total ?? "n/a"} · external ${domainProfile.edges?.external?.total ?? "n/a"}`,
    );
    for (const capability of (domainProfile.capabilities?.nodes || []).slice(0, 5)) {
      console.log(`  ${capability.slug}`);
    }
  }

  // 19. domain_matrix
  header(`query_ontology(domain_matrix)`);
  const domainMatrix = getResult(responses, 20);
  const domainMatrixStructured = structuredContent(20);
  if (domainMatrix) {
    console.log(`  structuredContent: ${structuredContentStatus(domainMatrix, domainMatrixStructured)}`);
    console.log(
      `  domains ${domainMatrix.summary?.domains ?? "n/a"} · cross ${domainMatrix.summary?.crossDomainEdges ?? "n/a"} · self ${domainMatrix.summary?.selfDomainEdges ?? "n/a"} · connections ${domainMatrix.connections?.rows?.length ?? "n/a"} / total ${domainMatrix.connections?.total ?? "n/a"}`,
    );
    for (const row of (domainMatrix.connections?.rows || []).slice(0, 5)) {
      console.log(`  ${row.from} → ${row.to}: ${row.count}`);
    }
  }

  // 20. components
  header(`query_ontology(components)`);
  const components = getResult(responses, 21);
  const componentsStructured = structuredContent(21);
  if (components) {
    console.log(`  structuredContent: ${structuredContentStatus(components, componentsStructured)}`);
    console.log(
      `  components ${components.components?.length ?? "n/a"} / total ${components.totalComponents ?? "n/a"} · largest ${components.largestSize ?? "n/a"} · singletons ${components.singletonCount ?? "n/a"}`,
    );
    for (const component of (components.components || []).slice(0, 5)) {
      const first = component.nodes?.[0]?.slug ?? "n/a";
      console.log(`  #${component.id}: ${component.size} nodes · first ${first}`);
    }
  }

  // 21. relation_check
  header(`query_ontology(relation_check mcp-server → ai-agent-partner)`);
  const relationCheck = getResult(responses, 22);
  const relationCheckStructured = structuredContent(22);
  if (relationCheck) {
    console.log(`  structuredContent: ${structuredContentStatus(relationCheck, relationCheckStructured)}`);
    console.log(
      `  ${relationCheck.from} -[${relationCheck.relation}]-> ${relationCheck.to}`,
    );
    console.log(
      `  verdict ${relationCheck.verdict ?? "n/a"} · exists ${relationCheck.exists ?? "n/a"} · schema ${relationCheck.schemaPattern ? "matched" : "new"}`,
    );
  }

  // 22. maintenance_plan
  header(`query_ontology(maintenance_plan)`);
  const maintenancePlan = getResult(responses, 23);
  const maintenancePlanStructured = structuredContent(23);
  if (maintenancePlan) {
    console.log(`  structuredContent: ${structuredContentStatus(maintenancePlan, maintenancePlanStructured)}`);
    console.log(
      `  actions ${maintenancePlan.actions?.length ?? "n/a"} / remaining ${maintenancePlan.summary?.remainingActions ?? "n/a"} · executable ${maintenancePlan.summary?.executableActions ?? "n/a"} · review ${maintenancePlan.summary?.reviewActions ?? "n/a"}`,
    );
    console.log(
      `  cursor found ${maintenancePlan.cursor?.found ?? "n/a"} · reason ${maintenancePlan.cursor?.reason ?? "null"} · next ${maintenancePlan.cursor?.nextAfterActionId ?? "none"} · hasMore ${maintenancePlan.cursor?.hasMore ?? "n/a"}`,
    );
    console.log(
      `  buckets phase ${maintenanceBucketSummary(maintenancePlan.byPhase)} · severity ${maintenanceBucketSummary(maintenancePlan.bySeverity)} · kind ${maintenanceBucketSummary(maintenancePlan.byKind)}`,
    );
    console.log(
      `  next executable ${maintenanceNextActionSummary(maintenancePlan.nextExecutableAction)} · next review ${maintenanceNextActionSummary(maintenancePlan.nextReviewAction)}`,
    );
    for (const action of (maintenancePlan.actions || []).slice(0, 5)) {
      console.log(`  ${action.id}: ${action.phase}/${action.kind} · ${action.severity} · executable ${action.executable}`);
    }
  }
  header(`query_ontology(maintenance_plan missing cursor)`);
  const maintenancePlanMissingCursor = getResult(responses, 54);
  const maintenancePlanMissingCursorStructured = structuredContent(54);
  if (maintenancePlanMissingCursor) {
    console.log(`  structuredContent: ${structuredContentStatus(maintenancePlanMissingCursor, maintenancePlanMissingCursorStructured)}`);
    console.log(
      `  found ${maintenancePlanMissingCursor.cursor?.found ?? "n/a"} · reason ${maintenancePlanMissingCursor.cursor?.reason ?? "none"} · remaining ${maintenancePlanMissingCursor.summary?.remainingActions ?? "n/a"}`,
    );
  }

  // 23. growth_plan
  header(`query_ontology(growth_plan)`);
  const growthPlan = getResult(responses, 24);
  const growthPlanStructured = structuredContent(24);
  if (growthPlan) {
    console.log(`  structuredContent: ${structuredContentStatus(growthPlan, growthPlanStructured)}`);
    console.log(
      `  actions ${growthPlan.summary?.totalActions ?? "n/a"} · relations ${growthPlan.summary?.relationRecommendations ?? "n/a"} · external ${growthPlan.summary?.externalElementRefs ?? "n/a"} · dangling ${growthPlan.summary?.danglingReferences ?? "n/a"}`,
    );
    console.log(
      `  unassigned ${growthPlan.summary?.unassignedNodes ?? "n/a"} · emptyDomains ${growthPlan.summary?.emptyDomains ?? "n/a"} · ignoredExternal ${growthPlan.summary?.externalElementRefsIgnored ?? "n/a"}`,
    );
  }

  // 24. recommend_relations
  header(`query_ontology(recommend_relations)`);
  const relationRecommendations = getResult(responses, 25);
  const relationRecommendationsStructured = structuredContent(25);
  if (relationRecommendations) {
    console.log(`  structuredContent: ${structuredContentStatus(relationRecommendations, relationRecommendationsStructured)}`);
    console.log(
      `  recommendations ${relationRecommendations.recommendations?.length ?? "n/a"} / total ${relationRecommendations.totalRecommendations ?? "n/a"} · limited ${relationRecommendations.limited ?? "n/a"}`,
    );
    for (const row of (relationRecommendations.recommendations || []).slice(0, 5)) {
      console.log(`  ${row.from} -[${row.relation}]-> ${row.to}`);
    }
  }

  // 25. cycles
  header(`query_ontology(cycles)`);
  const cycles = getResult(responses, 26);
  const cyclesStructured = structuredContent(26);
  if (cycles) {
    console.log(`  structuredContent: ${structuredContentStatus(cycles, cyclesStructured)}`);
    console.log(
      `  cycles ${cycles.cycles?.length ?? "n/a"} / total ${cycles.totalCycles ?? "n/a"} · types ${(cycles.relationTypes || []).join(", ") || "n/a"} · maxDepth ${cycles.maxDepth ?? "n/a"}`,
    );
    for (const cycle of (cycles.cycles || []).slice(0, 5)) {
      console.log(`  ${cycle.id}: ${cycle.nodes.join(" → ")}`);
    }
  }

  // 26. topological_order
  header(`query_ontology(topological_order)`);
  const topologicalOrder = getResult(responses, 27);
  const topologicalOrderStructured = structuredContent(27);
  if (topologicalOrder) {
    console.log(`  structuredContent: ${structuredContentStatus(topologicalOrder, topologicalOrderStructured)}`);
    console.log(
      `  acyclic ${topologicalOrder.acyclic ?? "n/a"} · ordered ${topologicalOrder.order?.length ?? "n/a"} / ${topologicalOrder.orderedCount ?? "n/a"} · total ${topologicalOrder.totalNodes ?? "n/a"} · edges ${topologicalOrder.selectedEdges ?? "n/a"}`,
    );
    for (const row of (topologicalOrder.order || []).slice(0, 5)) {
      console.log(`  rank ${row.rank}: ${row.slug}`);
    }
  }

  // 27. lineage
  header(`query_ontology(lineage mcp-server)`);
  const lineage = getResult(responses, 28);
  const lineageStructured = structuredContent(28);
  if (lineage) {
    console.log(`  structuredContent: ${structuredContentStatus(lineage, lineageStructured)}`);
    console.log(
      `  center ${lineage.center ?? "n/a"} · ancestors ${lineage.ancestors?.total ?? "n/a"} · descendants ${lineage.descendants?.total ?? "n/a"} · edges ${lineage.edges?.length ?? "n/a"}`,
    );
    for (const row of (lineage.ancestors?.nodes || []).slice(0, 5)) {
      console.log(`  ancestor d${row.distance}: ${row.slug} via ${row.via}`);
    }
  }

  // 28. containment_tree
  header(`query_ontology(containment_tree project)`);
  const containmentTree = getResult(responses, 29);
  const containmentTreeStructured = structuredContent(29);
  if (containmentTree) {
    console.log(`  structuredContent: ${structuredContentStatus(containmentTree, containmentTreeStructured)}`);
    console.log(
      `  root ${containmentTree.root ?? "n/a"} · roots ${containmentTree.roots?.length ?? "n/a"} / total ${containmentTree.totalRoots ?? "n/a"} · emitted ${containmentTree.emittedNodes ?? "n/a"} · limited ${containmentTree.limited ?? "n/a"}`,
    );
    for (const root of (containmentTree.roots || []).slice(0, 3)) {
      console.log(`  ${root.slug}: ${(root.children || []).length} children`);
    }
  }

  // 29. reachability
  header(`query_ontology(reachability mcp-server)`);
  const reachability = getResult(responses, 30);
  const reachabilityStructured = structuredContent(30);
  if (reachability) {
    console.log(`  structuredContent: ${structuredContentStatus(reachability, reachabilityStructured)}`);
    console.log(
      `  start ${reachability.start ?? "n/a"} · reachable ${reachability.summary?.reachableNodes ?? "n/a"} · layers ${reachability.summary?.layers ?? "n/a"} · terminal ${reachability.summary?.terminalNodes ?? "n/a"}`,
    );
    for (const layer of (reachability.layers || []).slice(0, 5)) {
      console.log(`  distance ${layer.distance}: ${(layer.nodes || []).map((node) => node.slug).join(", ")}`);
    }
  }

  // 30. impact
  header(`query_ontology(impact mcp-server)`);
  const impact = getResult(responses, 31);
  const impactStructured = structuredContent(31);
  if (impact) {
    console.log(`  structuredContent: ${structuredContentStatus(impact, impactStructured)}`);
    console.log(
      `  center ${impact.center ?? "n/a"} · impacted ${impact.nodes?.length ?? "n/a"} / total ${impact.total ?? "n/a"} · limited ${impact.limited ?? "n/a"}`,
    );
    for (const row of (impact.nodes || []).slice(0, 5)) {
      console.log(`  d${row.distance}: ${row.slug}`);
    }
  }

  // 31. blast_radius
  header(`query_ontology(blast_radius mcp-server)`);
  const blastRadius = getResult(responses, 32);
  const blastRadiusStructured = structuredContent(32);
  if (blastRadius) {
    console.log(`  structuredContent: ${structuredContentStatus(blastRadius, blastRadiusStructured)}`);
    console.log(
      `  center ${blastRadius.center ?? "n/a"} · risk ${blastRadius.risk ?? "n/a"} · affected ${blastRadius.summary?.affectedNodes ?? "n/a"} nodes · crossDomain ${blastRadius.summary?.crossDomainEdges ?? "n/a"}`,
    );
    for (const row of (blastRadius.nodes?.rows || []).slice(0, 5)) {
      console.log(`  ${row.slug}: ${row.domain ?? "no-domain"}`);
    }
  }

  // 32. subgraph
  header(`query_ontology(subgraph mcp-server)`);
  const subgraph = getResult(responses, 33);
  const subgraphStructured = structuredContent(33);
  if (subgraph) {
    console.log(`  structuredContent: ${structuredContentStatus(subgraph, subgraphStructured)}`);
    console.log(
      `  seed ${subgraph.seed ?? "n/a"} · nodes ${subgraph.nodes?.length ?? "n/a"} / total ${subgraph.totalNodes ?? "n/a"} · edges ${subgraph.edges?.length ?? "n/a"} · limited ${subgraph.limited ?? "n/a"}`,
    );
    for (const row of (subgraph.nodes || []).slice(0, 5)) {
      console.log(`  d${row.distance}: ${row.slug}`);
    }
  }

  // 33. schema
  header(`query_ontology(schema)`);
  const schema = getResult(responses, 34);
  const schemaStructured = structuredContent(34);
  if (schema) {
    console.log(`  structuredContent: ${structuredContentStatus(schema, schemaStructured)}`);
    console.log(
      `  patterns ${schema.patterns?.length ?? "n/a"} / total ${schema.totalPatterns ?? "n/a"} · limited ${schema.limited ?? "n/a"}`,
    );
    for (const pattern of (schema.patterns || []).slice(0, 5)) {
      console.log(`  (${pattern.fromKind}) -[${pattern.relation}]-> (${pattern.toKind}) x${pattern.count}`);
    }
  }

  // 34. facets
  header(`query_ontology(facets)`);
  const facets = getResult(responses, 35);
  const facetsStructured = structuredContent(35);
  if (facets) {
    console.log(`  structuredContent: ${structuredContentStatus(facets, facetsStructured)}`);
    console.log(
      `  graph nodes ${facets.graph?.nodes ?? "n/a"} · edges ${facets.graph?.edges ?? "n/a"} · topDegree ${facets.nodes?.topByDegree?.length ?? "n/a"} · topPatterns ${facets.edges?.topPatterns?.length ?? "n/a"}`,
    );
  }

  // 35. match_nodes
  header(`query_ontology(match_nodes capability slugContains=mcp)`);
  const matchNodes = getResult(responses, 36);
  const matchNodesStructured = structuredContent(36);
  if (matchNodes) {
    console.log(`  structuredContent: ${structuredContentStatus(matchNodes, matchNodesStructured)}`);
    console.log(
      `  nodes ${matchNodes.nodes?.length ?? "n/a"} / total ${matchNodes.totalMatches ?? "n/a"} · limited ${matchNodes.limited ?? "n/a"}`,
    );
    for (const node of (matchNodes.nodes || []).slice(0, 5)) {
      console.log(`  ${node.slug}: degree ${node.degree ?? "n/a"}`);
    }
  }

  // 36. match_edges
  header(`query_ontology(match_edges from=mcp-server)`);
  const matchEdges = getResult(responses, 37);
  const matchEdgesStructured = structuredContent(37);
  if (matchEdges) {
    console.log(`  structuredContent: ${structuredContentStatus(matchEdges, matchEdgesStructured)}`);
    console.log(
      `  edges ${matchEdges.edges?.length ?? "n/a"} / total ${matchEdges.totalMatches ?? "n/a"} · limited ${matchEdges.limited ?? "n/a"}`,
    );
    for (const edge of (matchEdges.edges || []).slice(0, 5)) {
      console.log(`  ${edge.from} -[${edge.via}]-> ${edge.to} (${edge.toKind})`);
    }
  }

  // 37. node_profile
  header(`query_ontology(node_profile mcp-server)`);
  const nodeProfile = getResult(responses, 38);
  const nodeProfileStructured = structuredContent(38);
  if (nodeProfile) {
    console.log(`  structuredContent: ${structuredContentStatus(nodeProfile, nodeProfileStructured)}`);
    console.log(
      `  center ${nodeProfile.center ?? "n/a"} · degree ${nodeProfile.degree?.total ?? "n/a"} · incoming ${nodeProfile.edges?.incoming?.total ?? "n/a"} · outgoing ${nodeProfile.edges?.outgoing?.total ?? "n/a"}`,
    );
    console.log(
      `  containment parents ${nodeProfile.containment?.parents?.length ?? "n/a"} · children ${nodeProfile.containment?.children?.length ?? "n/a"} · aliases ${(nodeProfile.aliases || []).length}`,
    );
  }

  // 38. centrality
  header(`query_ontology(centrality)`);
  const centrality = getResult(responses, 39);
  const centralityStructured = structuredContent(39);
  if (centrality) {
    console.log(`  structuredContent: ${structuredContentStatus(centrality, centralityStructured)}`);
    console.log(
      `  graph ${centrality.graph?.nodes ?? "n/a"} nodes · pageRank ${centrality.rankings?.pageRank?.length ?? "n/a"} · bridges ${centrality.rankings?.bridges?.length ?? "n/a"}`,
    );
    for (const row of (centrality.rankings?.pageRank || []).slice(0, 5)) {
      console.log(`  ${row.slug}: pr ${row.pageRank?.toFixed?.(4) ?? "n/a"} · degree ${row.degree ?? "n/a"}`);
    }
  }

  // 39. communities
  header(`query_ontology(communities)`);
  const communities = getResult(responses, 40);
  const communitiesStructured = structuredContent(40);
  if (communities) {
    console.log(`  structuredContent: ${structuredContentStatus(communities, communitiesStructured)}`);
    console.log(
      `  communities ${communities.communities?.length ?? "n/a"} / total ${communities.summary?.communities ?? "n/a"} · largest ${communities.summary?.largestSize ?? "n/a"} · cross ${communities.summary?.crossCommunityEdges ?? "n/a"}`,
    );
    for (const community of (communities.communities || []).slice(0, 5)) {
      console.log(`  #${community.id}: ${community.label} · ${community.size} nodes`);
    }
  }

  // 40. similar_nodes
  header(`query_ontology(similar_nodes candidate=mcp-server-v2)`);
  const similarNodes = getResult(responses, 41);
  const similarNodesStructured = structuredContent(41);
  if (similarNodes) {
    console.log(`  structuredContent: ${structuredContentStatus(similarNodes, similarNodesStructured)}`);
    console.log(
      `  matches ${similarNodes.matches?.length ?? "n/a"} / total ${similarNodes.totalMatches ?? "n/a"} · limited ${similarNodes.limited ?? "n/a"}`,
    );
    for (const match of (similarNodes.matches || []).slice(0, 5)) {
      console.log(`  ${match.node?.slug ?? "n/a"}: score ${match.score?.toFixed?.(3) ?? "n/a"}`);
    }
  }

  // 41. explain_relation
  header(`query_ontology(explain_relation mcp-server → vault-local-first)`);
  const explainRelation = getResult(responses, 42);
  const explainRelationStructured = structuredContent(42);
  if (explainRelation) {
    console.log(`  structuredContent: ${structuredContentStatus(explainRelation, explainRelationStructured)}`);
    console.log(
      `  verdict ${explainRelation.verdict ?? "n/a"} · sameDomain ${explainRelation.domains?.sameDomain ?? "n/a"} · path ${explainRelation.shortestPath?.found ?? "n/a"} · hops ${explainRelation.shortestPath?.hopCount ?? "n/a"}`,
    );
    if (explainRelation.shortestPath?.found) {
      console.log(`  ${explainRelation.shortestPath.hops.join(" → ")}`);
    }
  }

  // 42. neighbors
  header(`query_ontology(neighbors mcp-server)`);
  const neighbors = getResult(responses, 43);
  const neighborsStructured = structuredContent(43);
  if (neighbors) {
    console.log(`  structuredContent: ${structuredContentStatus(neighbors, neighborsStructured)}`);
    console.log(
      `  center ${neighbors.center ?? "n/a"} · edges ${neighbors.edges?.length ?? "n/a"} / total ${neighbors.total ?? "n/a"} · nodes ${neighbors.nodes?.length ?? "n/a"} · limited ${neighbors.limited ?? "n/a"}`,
    );
    for (const edge of (neighbors.edges || []).slice(0, 5)) {
      console.log(`  ${edge.direction}: ${edge.from} -[${edge.via}]-> ${edge.to}`);
    }
  }

  // 43. path
  header(`query_ontology(path mcp-server → vault-local-first)`);
  const queryPath = getResult(responses, 44);
  const queryPathStructured = structuredContent(44);
  if (queryPath) {
    console.log(`  structuredContent: ${structuredContentStatus(queryPath, queryPathStructured)}`);
    console.log(
      `  found ${queryPath.found ?? "n/a"} · hops ${queryPath.hopCount ?? "n/a"} · edges ${queryPath.edges?.length ?? "n/a"}`,
    );
    if (queryPath.found) {
      console.log(`  ${queryPath.hops.join(" → ")}`);
    }
  }

  // 44. project_scope
  header(`query_ontology(project_scope project)`);
  const projectScope = getResult(responses, 45);
  const projectScopeStructured = structuredContent(45);
  if (projectScope) {
    console.log(`  structuredContent: ${structuredContentStatus(projectScope, projectScopeStructured)}`);
    console.log(
      `  project ${projectScope.project ?? "n/a"} · nodes ${projectScope.nodes?.rows?.length ?? "n/a"} / total ${projectScope.summary?.nodes ?? "n/a"} · internal ${projectScope.summary?.internalEdges ?? "n/a"} · external ${projectScope.summary?.externalEdges ?? "n/a"}`,
    );
    console.log(
      `  edges boundary ${projectScope.summary?.boundaryEdges ?? "n/a"} · unresolved ${projectScope.summary?.unresolvedEdges ?? "n/a"}`,
    );
  }

  // 45. strict argument rejection
  header("strict arguments — unknown tool argument rejection");
  const strictArgs = responses.find((response) => response.id === 46);
  const strictArgsText = strictArgs?.result?.content?.[0]?.text || "";
  console.log(`  rejected: ${strictArgs?.result?.isError === true}`);
  console.log(`  repair: ${strictRepairSummary(strictArgs)}`);
  if (strictArgsText) {
    console.log(`  ${strictArgsText}`);
  }

  // 46. strict multi-argument rejection
  header("strict arguments — multiple unknown tool argument rejection");
  const strictMultiArgs = responses.find((response) => response.id === 59);
  const strictMultiArgsText = strictMultiArgs?.result?.content?.[0]?.text || "";
  console.log(`  rejected: ${strictMultiArgs?.result?.isError === true}`);
  console.log(`  repair: ${strictRepairSummary(strictMultiArgs)}`);
  if (strictMultiArgsText) {
    console.log(`  ${strictMultiArgsText}`);
  }

  // 47. strict enum rejection
  header("strict enums — invalid query operation rejection");
  const strictEnum = responses.find((response) => response.id === 47);
  const strictEnumText = strictEnum?.result?.content?.[0]?.text || "";
  console.log(`  rejected: ${strictEnum?.result?.isError === true}`);
  console.log(`  repair: ${strictRepairSummary(strictEnum)}`);
  if (strictEnumText) {
    console.log(`  ${strictEnumText}`);
  }

  // 48. strict unknown tool rejection
  header("strict tool names — unknown tool rejection");
  const strictUnknownTool = responses.find((response) => response.id === 84);
  const strictUnknownToolText = strictUnknownTool?.result?.content?.[0]?.text || "";
  console.log(`  rejected: ${strictUnknownTool?.result?.isError === true}`);
  console.log(`  repair: ${strictRepairSummary(strictUnknownTool)}`);
  if (strictUnknownToolText) {
    console.log(`  ${strictUnknownToolText}`);
  }

  // 49. strict maintenance filter rejection
  header("strict maintenance filters — invalid phase/severity/kind rejection");
  const strictMaintenancePhaseFilter = responses.find((response) => response.id === 51);
  const strictMaintenancePhaseFilterText = strictMaintenancePhaseFilter?.result?.content?.[0]?.text || "";
  console.log(`  phase rejected: ${strictMaintenancePhaseFilter?.result?.isError === true}`);
  if (strictMaintenancePhaseFilterText) {
    console.log(`  ${strictMaintenancePhaseFilterText}`);
  }
  const strictMaintenanceSeverityFilter = responses.find((response) => response.id === 52);
  const strictMaintenanceSeverityFilterText = strictMaintenanceSeverityFilter?.result?.content?.[0]?.text || "";
  console.log(`  severity rejected: ${strictMaintenanceSeverityFilter?.result?.isError === true}`);
  if (strictMaintenanceSeverityFilterText) {
    console.log(`  ${strictMaintenanceSeverityFilterText}`);
  }
  const strictMaintenanceKindFilter = responses.find((response) => response.id === 53);
  const strictMaintenanceKindFilterText = strictMaintenanceKindFilter?.result?.content?.[0]?.text || "";
  console.log(`  kind rejected: ${strictMaintenanceKindFilter?.result?.isError === true}`);
  if (strictMaintenanceKindFilterText) {
    console.log(`  ${strictMaintenanceKindFilterText}`);
  }

  // 50. strict relation filter rejection
  header("strict relation filters — invalid dependencyTypes rejection");
  const strictRelationFilter = responses.find((response) => response.id === 61);
  const strictRelationFilterText = strictRelationFilter?.result?.content?.[0]?.text || "";
  console.log(`  dependencyTypes rejected: ${strictRelationFilter?.result?.isError === true}`);
  if (strictRelationFilterText) {
    console.log(`  ${strictRelationFilterText}`);
  }
  const strictFindNeighborsTypeFilter = responses.find((response) => response.id === 75);
  const strictFindNeighborsTypeFilterText = strictFindNeighborsTypeFilter?.result?.content?.[0]?.text || "";
  console.log(`  find_neighbors.types rejected: ${strictFindNeighborsTypeFilter?.result?.isError === true}`);
  if (strictFindNeighborsTypeFilterText) {
    console.log(`  ${strictFindNeighborsTypeFilterText}`);
  }
  const strictFindOrphansKindFilter = responses.find((response) => response.id === 76);
  const strictFindOrphansKindFilterText = strictFindOrphansKindFilter?.result?.content?.[0]?.text || "";
  console.log(`  find_orphans.kind rejected: ${strictFindOrphansKindFilter?.result?.isError === true}`);
  if (strictFindOrphansKindFilterText) {
    console.log(`  ${strictFindOrphansKindFilterText}`);
  }
  const strictFindOrphansExcludeKindFilter = responses.find((response) => response.id === 77);
  const strictFindOrphansExcludeKindFilterText = strictFindOrphansExcludeKindFilter?.result?.content?.[0]?.text || "";
  console.log(`  find_orphans.excludeKinds rejected: ${strictFindOrphansExcludeKindFilter?.result?.isError === true}`);
  if (strictFindOrphansExcludeKindFilterText) {
    console.log(`  ${strictFindOrphansExcludeKindFilterText}`);
  }
  const strictQueryConceptsKindFilter = responses.find((response) => response.id === 78);
  const strictQueryConceptsKindFilterText = strictQueryConceptsKindFilter?.result?.content?.[0]?.text || "";
  console.log(`  query_concepts.kind rejected: ${strictQueryConceptsKindFilter?.result?.isError === true}`);
  if (strictQueryConceptsKindFilterText) {
    console.log(`  ${strictQueryConceptsKindFilterText}`);
  }
  const strictQueryConceptsHasKeyFilter = responses.find((response) => response.id === 79);
  const strictQueryConceptsHasKeyFilterText = strictQueryConceptsHasKeyFilter?.result?.content?.[0]?.text || "";
  console.log(`  query_concepts.has-key rejected: ${strictQueryConceptsHasKeyFilter?.result?.isError === true}`);
  if (strictQueryConceptsHasKeyFilterText) {
    console.log(`  ${strictQueryConceptsHasKeyFilterText}`);
  }
  const strictListConceptsKindFilter = responses.find((response) => response.id === 80);
  const strictListConceptsKindFilterText = strictListConceptsKindFilter?.result?.content?.[0]?.text || "";
  console.log(`  list_concepts.kind rejected: ${strictListConceptsKindFilter?.result?.isError === true}`);
  if (strictListConceptsKindFilterText) {
    console.log(`  ${strictListConceptsKindFilterText}`);
  }

  // 51. strict relation_check rejection
  header("strict relation_check — invalid type rejection");
  const strictRelationCheck = responses.find((response) => response.id === 66);
  const strictRelationCheckText = strictRelationCheck?.result?.content?.[0]?.text || "";
  console.log(`  relation_check type rejected: ${strictRelationCheck?.result?.isError === true}`);
  console.log(`  repair: ${strictRepairSummary(strictRelationCheck)}`);
  if (strictRelationCheckText) {
    console.log(`  ${strictRelationCheckText}`);
  }

  // 52. strict add_relation rejection
  header("strict add_relation — invalid type rejection + no-write metadata");
  const strictAddRelation = responses.find((response) => response.id === 70);
  const strictAddRelationText = strictAddRelation?.result?.content?.[0]?.text || "";
  console.log(`  add_relation type rejected: ${strictAddRelation?.result?.isError === true}`);
  console.log(`  repair: ${strictRepairSummary(strictAddRelation)}`);
  console.log(`  write metadata: ${writeMetadataAbsenceSummary(strictAddRelation)}`);
  if (strictAddRelationText) {
    console.log(`  ${strictAddRelationText}`);
  }

  // 53. strict graph kind filter rejection
  header("strict graph filters — invalid match_nodes.kind/sort, match_edges.type, and recommend_relations.kind rejection");
  const strictGraphKindFilter = responses.find((response) => response.id === 67);
  const strictGraphKindFilterText = strictGraphKindFilter?.result?.content?.[0]?.text || "";
  console.log(`  match_nodes.kind rejected: ${strictGraphKindFilter?.result?.isError === true}`);
  if (strictGraphKindFilterText) {
    console.log(`  ${strictGraphKindFilterText}`);
  }
  const strictRecommendRelationsKindFilter = responses.find((response) => response.id === 71);
  const strictRecommendRelationsKindFilterText = strictRecommendRelationsKindFilter?.result?.content?.[0]?.text || "";
  console.log(`  recommend_relations.kind typo rejected: ${strictRecommendRelationsKindFilter?.result?.isError === true}`);
  if (strictRecommendRelationsKindFilterText) {
    console.log(`  ${strictRecommendRelationsKindFilterText}`);
  }
  const strictRecommendRelationsUnsupportedKindFilter = responses.find((response) => response.id === 72);
  const strictRecommendRelationsUnsupportedKindFilterText = strictRecommendRelationsUnsupportedKindFilter?.result?.content?.[0]?.text || "";
  console.log(`  recommend_relations.kind unsupported rejected: ${strictRecommendRelationsUnsupportedKindFilter?.result?.isError === true}`);
  if (strictRecommendRelationsUnsupportedKindFilterText) {
    console.log(`  ${strictRecommendRelationsUnsupportedKindFilterText}`);
  }
  const strictMatchNodesSortFilter = responses.find((response) => response.id === 73);
  const strictMatchNodesSortFilterText = strictMatchNodesSortFilter?.result?.content?.[0]?.text || "";
  console.log(`  match_nodes.sort rejected: ${strictMatchNodesSortFilter?.result?.isError === true}`);
  if (strictMatchNodesSortFilterText) {
    console.log(`  ${strictMatchNodesSortFilterText}`);
  }
  const strictMatchEdgesTypeFilter = responses.find((response) => response.id === 74);
  const strictMatchEdgesTypeFilterText = strictMatchEdgesTypeFilter?.result?.content?.[0]?.text || "";
  console.log(`  match_edges.type rejected: ${strictMatchEdgesTypeFilter?.result?.isError === true}`);
  if (strictMatchEdgesTypeFilterText) {
    console.log(`  ${strictMatchEdgesTypeFilterText}`);
  }
  const strictGraphFromKindFilter = responses.find((response) => response.id === 68);
  const strictGraphFromKindFilterText = strictGraphFromKindFilter?.result?.content?.[0]?.text || "";
  console.log(`  match_edges.fromKind rejected: ${strictGraphFromKindFilter?.result?.isError === true}`);
  if (strictGraphFromKindFilterText) {
    console.log(`  ${strictGraphFromKindFilterText}`);
  }
  const strictGraphToKindFilter = responses.find((response) => response.id === 69);
  const strictGraphToKindFilterText = strictGraphToKindFilter?.result?.content?.[0]?.text || "";
  console.log(`  match_edges.toKind rejected: ${strictGraphToKindFilter?.result?.isError === true}`);
  if (strictGraphToKindFilterText) {
    console.log(`  ${strictGraphToKindFilterText}`);
  }

  const graphStructuredContentRows = [
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
  ];
  const directStructuredContentRows = [
    ["list_kinds", kinds, kindsStructured],
    ["list_concepts", list, listStructured],
    ["project_probe", projectProbe, projectProbeStructured],
    ["get_concepts", batch, batchStructured],
    ["find_evidence", ev, evStructured],
    ["find_path", path, pathStructured],
    ["find_backlinks", bl, blStructured],
    ["find_orphans", orph, orphStructured],
    ["query_concepts", queryConcepts, queryConceptsStructured],
    ["query_concepts_limited", queryConceptsLimited, queryConceptsLimitedStructured],
    ["analyze_repo_structure", analyzedRepo, analyzedRepoStructured],
    ["infer_imports", inferredImports, inferredImportsStructured],
    ["validate_vault", validation, validationStructured],
    ["compile_ontology", compiled, compiledStructured],
    ["compile_ontology_indexes", compiledIndexes, compiledIndexesStructured],
    ["add_concepts_row_repair", addConceptsRowRepair, addConceptsRowRepairStructured],
    ["add_relations_row_repair", addRelationsRowRepair, addRelationsRowRepairStructured],
  ];

  const failures = evaluateDogfoodGate({
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
    validationStructured,
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
  });
  const missingLabels = missingResponseLabels(responses, DOGFOOD_RESPONSE_LABELS);
  if (timedOut && missingLabels.length > 0) {
    failures.unshift(rpcTimeoutFailure(timeoutMs, missingLabels));
  }
  failures.push(...stderrWarningFailures(stderr));

  // 분석
  header("Analysis — AI agent quality assessment");
  const total = kinds?.total || 0;
  const orphCount = orph?.total || 0;
  const orphRatio = total > 0 ? ((orphCount / total) * 100).toFixed(0) : 0;
  console.log(`  vault size: ${total} 노드`);
  const inventoryFailure = toolsListInventoryFailure(toolsList?.tools);
  const schemaFailure = toolsListSchemaFailure(toolsList?.tools);
  console.log(`  initialize instructions: ${initializeInstructionStatus(initialize)}`);
  console.log(`  tools/list inventory: ${toolsListInventoryStatus(inventoryFailure)}`);
  console.log(`  tools/list schema: ${toolsListSchemaStatus(schemaFailure)}`);
  console.log(`  tools/list annotations: ${toolsListAnnotationSummary(toolsList?.tools)}`);
  console.log(`  tools/list write row labels: ${writeRowLabelGuidanceSummary(toolsList?.tools)}`);
  console.log(`  orphans: ${orphCount} (${orphRatio}%)`);
  console.log(
    `  list_concepts vaultWarnings: ${list?.vaultWarnings ? "있음 (vault 정합성 회귀!)" : "0 (clean)"}`,
  );
  console.log(`  project_probe: ${projectProbe ? formatCount(projectProbe.total ?? 0, "project node") : "n/a"}`);
  console.log(`  get_concepts: ${(batch?.concepts || []).filter((row) => row?.ok === true).length} ok · ${(batch?.concepts || []).filter((row) => row?.ok === false).length} partial`);
  console.log(`  query_concepts: ${queryConcepts ? `${queryConcepts.matches?.length ?? 0} matches · limited ${queryConcepts.limited === true}` : "n/a"}`);
  console.log(`  query_concepts_limited: ${queryConceptsLimited ? `${queryConceptsLimited.matches?.length ?? 0} matches · total ${queryConceptsLimited.total ?? "n/a"} · limited ${queryConceptsLimited.limited === true}` : "n/a"}`);
  console.log(`  analyze_repo_structure: ${analyzedRepo ? `${analyzedRepo.framework} · ${analyzedRepo.capabilities?.length ?? 0} capabilities · ${analyzedRepo.elements?.length ?? 0} elements` : "n/a"}`);
  console.log(`  infer_imports: ${inferredImports ? `${inferredImports.filesScanned ?? 0} files · ${inferredImports.moduleEdges?.length ?? 0} module edges · ${importModuleEdgeKindSummary(inferredImports.moduleEdges, 2)}` : "n/a"}`);
  console.log(
    `  validate_vault: ${validation ? formatCount(validation.summary?.problemFiles ?? 0, "problem file") : "n/a"}`,
  );
  console.log(`  find_path: hops ${path?.hopCount ?? "n/a"} · edges ${path?.edges?.length ?? "n/a"}`);
  console.log(`  find_backlinks: ${bl?.total ?? "n/a"} (mcp-server 가 얼마나 popular)`);
  console.log(
    `  workspace_brief: ${brief?.status ?? "n/a"} (${(brief?.nextActions || []).length} next actions · ${(brief?.health?.checks || []).length} health checks)`,
  );
  console.log(
    `  ${workspaceNextActionAnalysisLabel("workspace_brief")}: ${workspaceNextActionSummary(brief?.nextActions)}`,
  );
  console.log(
    `  workspace_brief_tuned: ${tunedBrief?.status ?? "n/a"} (${(tunedBrief?.nextActions || []).length} next actions · ${(tunedBrief?.health?.checks || []).length} health checks)`,
  );
  console.log(`  workspace_brief_tuned scope: ${tunedWorkspaceBriefScopeSummary()}`);
  console.log(
    `  ${workspaceNextActionAnalysisLabel("workspace_brief_tuned")}: ${workspaceNextActionSummary(tunedBrief?.nextActions)}`,
  );
  console.log(`  health: ${health?.status ?? "n/a"} (${(health?.checks || []).length} checks)`);
  console.log(`  health checks: ${healthCheckStatusSummary(health?.checks)}`);
  console.log(`  health_tuned: ${tunedHealth?.status ?? "n/a"} (${(tunedHealth?.checks || []).length} checks)`);
  console.log(`  health_tuned scope: ${tunedHealthScopeSummary()}`);
  console.log(`  health_tuned checks: ${healthCheckStatusSummary(tunedHealth?.checks)}`);
  console.log(`  compile_ontology: ${compiled?.nodeCount ?? "n/a"} nodes · ${compiled?.edgeCount ?? "n/a"} edges · ${compiled?.issueCount ?? "n/a"} issues`);
  console.log(`  compile_ontology indexes: ${compiledIndexes ? compileIndexesSummary(compiledIndexes) : "n/a"}`);
  console.log(`  direct tool structuredContent: ${graphStructuredContentSummary(directStructuredContentRows)}`);
  console.log(`  graph query structuredContent: ${graphStructuredContentSummary(graphStructuredContentRows)}`);
  console.log(`  overview: ${overview?.graph?.nodes ?? "n/a"} nodes · ${overview?.graph?.edges ?? "n/a"} edges · ${(overview?.hubs || []).length} hubs`);
  console.log(`  pattern_walk: ${patternWalk?.paths?.rows?.length ?? "n/a"} paths (${patternWalk?.paths?.limited ? "limited" : "complete"})`);
  console.log(`  all_paths: ${allPaths?.paths?.length ?? "n/a"} paths (${allPaths?.limited ? "limited" : "complete"})`);
  console.log(`  all_paths query_plan: ${allPathsPlan?.estimate?.costClass ?? "n/a"} · limit ${allPathsPlan?.normalized?.limit ?? "n/a"}`);
  console.log(`  project_map query_plan: ${projectMapPlan?.estimate?.costClass ?? "n/a"} · ${projectMapPlan?.estimate?.strategy ?? "n/a"}`);
  console.log(`  project_map: ${projectMap?.domains?.length ?? "n/a"} domains · ${projectMap?.summary?.capabilities ?? "n/a"} capabilities`);
  console.log(`  domain_profile: ${domainProfile?.capabilities?.total ?? "n/a"} capabilities · ${domainProfile?.elements?.total ?? "n/a"} elements`);
  console.log(`  domain_matrix: ${domainMatrix?.summary?.crossDomainEdges ?? "n/a"} cross-domain edges · ${domainMatrix?.connections?.total ?? "n/a"} connections`);
  console.log(`  components: ${components?.totalComponents ?? "n/a"} total · largest ${components?.largestSize ?? "n/a"}`);
  console.log(`  component rows: ${componentSummary(components)}`);
  console.log(`  relation_check: ${relationCheck?.verdict ?? "n/a"} · exists ${relationCheck?.exists ?? "n/a"}`);
  console.log(`  maintenance_plan: found ${maintenancePlan?.cursor?.found ?? "n/a"} · reason ${maintenancePlan?.cursor?.reason ?? "null"} · ${maintenancePlan?.summary?.remainingActions ?? "n/a"} remaining · ${maintenancePlan?.summary?.executableActions ?? "n/a"} executable`);
  console.log(`  maintenance buckets: phase ${maintenanceBucketSummary(maintenancePlan?.byPhase)} · severity ${maintenanceBucketSummary(maintenancePlan?.bySeverity)} · kind ${maintenanceBucketSummary(maintenancePlan?.byKind)}`);
  console.log(`  maintenance next actions: executable ${maintenanceNextActionSummary(maintenancePlan?.nextExecutableAction)} · review ${maintenanceNextActionSummary(maintenancePlan?.nextReviewAction)}`);
  console.log(`  maintenance_plan_missing_cursor: found ${maintenancePlanMissingCursor?.cursor?.found ?? "n/a"} · reason ${maintenancePlanMissingCursor?.cursor?.reason ?? "n/a"}`);
  console.log(`  growth_plan: ${growthPlan?.summary?.totalActions ?? "n/a"} actions · ${growthPlan?.summary?.externalElementRefsIgnored ?? "n/a"} ignored external refs`);
  console.log(`  recommend_relations: ${relationRecommendations?.totalRecommendations ?? "n/a"} recommendations`);
  console.log(`  cycles: ${cycles?.totalCycles ?? "n/a"} total`);
  console.log(`  topological_order: ${topologicalOrder?.orderedCount ?? "n/a"} ordered · acyclic ${topologicalOrder?.acyclic ?? "n/a"}`);
  console.log(`  lineage: ${lineage?.ancestors?.total ?? "n/a"} ancestors · ${lineage?.descendants?.total ?? "n/a"} descendants`);
  console.log(`  containment_tree: ${containmentTree?.emittedNodes ?? "n/a"} emitted · limited ${containmentTree?.limited ?? "n/a"}`);
  console.log(`  reachability: ${reachability?.summary?.reachableNodes ?? "n/a"} reachable · ${reachability?.summary?.layers ?? "n/a"} layers`);
  console.log(`  impact: ${impact?.total ?? "n/a"} impacted · limited ${impact?.limited ?? "n/a"}`);
  console.log(`  blast_radius: ${blastRadius?.risk ?? "n/a"} risk · ${blastRadius?.summary?.affectedNodes ?? "n/a"} affected`);
  console.log(`  subgraph: ${subgraph?.totalNodes ?? "n/a"} nodes · ${subgraph?.totalEdges ?? "n/a"} edges`);
  console.log(`  schema: ${schema?.totalPatterns ?? "n/a"} patterns`);
  console.log(`  facets: ${facets?.graph?.nodes ?? "n/a"} nodes · ${facets?.graph?.edges ?? "n/a"} edges`);
  console.log(`  match_nodes: ${matchNodes?.totalMatches ?? "n/a"} matches`);
  console.log(`  match_edges: ${matchEdges?.totalMatches ?? "n/a"} matches`);
  console.log(`  node_profile: degree ${nodeProfile?.degree?.total ?? "n/a"} · aliases ${(nodeProfile?.aliases || []).length}`);
  console.log(`  centrality: ${centrality?.rankings?.pageRank?.length ?? "n/a"} pageRank rows`);
  console.log(`  communities: ${communities?.summary?.communities ?? "n/a"} total · largest ${communities?.summary?.largestSize ?? "n/a"}`);
  console.log(`  similar_nodes: ${similarNodes?.totalMatches ?? "n/a"} matches`);
  console.log(`  explain_relation: ${explainRelation?.verdict ?? "n/a"} · path ${explainRelation?.shortestPath?.found ?? "n/a"}`);
  console.log(`  neighbors: ${neighbors?.total ?? "n/a"} edges · limited ${neighbors?.limited ?? "n/a"}`);
  console.log(`  path: ${queryPath?.found ?? "n/a"} · hops ${queryPath?.hopCount ?? "n/a"} · edges ${queryPath?.edges?.length ?? "n/a"}`);
  console.log(`  project_scope: ${projectScope?.summary?.nodes ?? "n/a"} nodes · ${projectScope?.summary?.internalEdges ?? "n/a"} internal edges`);
  console.log(`  strict_args: ${strictRepairSummary(strictArgs)}`);
  console.log(`  strict_multi_args: ${strictRepairSummary(strictMultiArgs)}`);
  console.log(`  strict_enum: ${strictRepairSummary(strictEnum)}`);
  console.log(`  strict_unknown_tool: ${strictRepairSummary(strictUnknownTool)}`);
  console.log(`  strict_maintenance_phase_filter: ${strictRepairSummary(strictMaintenancePhaseFilter)}`);
  console.log(`  strict_maintenance_severity_filter: ${strictRepairSummary(strictMaintenanceSeverityFilter)}`);
  console.log(`  strict_maintenance_kind_filter: ${strictRepairSummary(strictMaintenanceKindFilter)}`);
  console.log(`  strict_relation_filter: ${strictRepairSummary(strictRelationFilter)}`);
  console.log(`  strict_find_neighbors_type_filter: ${strictRepairSummary(strictFindNeighborsTypeFilter)}`);
  console.log(`  strict_find_orphans_kind_filter: ${strictRepairSummary(strictFindOrphansKindFilter)}`);
  console.log(`  strict_find_orphans_exclude_kind_filter: ${strictRepairSummary(strictFindOrphansExcludeKindFilter)}`);
  console.log(`  strict_query_concepts_kind_filter: ${strictRepairSummary(strictQueryConceptsKindFilter)}`);
  console.log(`  strict_query_concepts_has_key_filter: ${strictRepairSummary(strictQueryConceptsHasKeyFilter)}`);
  console.log(`  strict_list_concepts_kind_filter: ${strictRepairSummary(strictListConceptsKindFilter)}`);
  console.log(`  strict_relation_check: ${strictRepairSummary(strictRelationCheck)}`);
  console.log(`  strict_add_relation: ${strictRepairSummary(strictAddRelation)}`);
  console.log(`  strict_add_relation_write_metadata: ${writeMetadataAbsenceSummary(strictAddRelation)}`);
  console.log(`  strict_graph_kind_filter: ${strictRepairSummary(strictGraphKindFilter)}`);
  console.log(`  strict_recommend_relations_kind_filter: ${strictRepairSummary(strictRecommendRelationsKindFilter)}`);
  console.log(`  strict_recommend_relations_unsupported_kind_filter: ${strictRepairSummary(strictRecommendRelationsUnsupportedKindFilter)}`);
  console.log(`  strict_match_nodes_sort_filter: ${strictRepairSummary(strictMatchNodesSortFilter)}`);
  console.log(`  strict_match_edges_type_filter: ${strictRepairSummary(strictMatchEdgesTypeFilter)}`);
  console.log(`  strict_graph_from_kind_filter: ${strictRepairSummary(strictGraphFromKindFilter)}`);
  console.log(`  strict_graph_to_kind_filter: ${strictRepairSummary(strictGraphToKindFilter)}`);
  console.log(`  batch caps: get_concepts ${getConceptsBatchCap?.result?.isError === true} · add_concepts ${addConceptsBatchCap?.result?.isError === true} · add_relations ${addRelationsBatchCap?.result?.isError === true}`);
  console.log(`  batch row repair: add_concepts ${batchRowRepairSummary(addConceptsRowRepair?.concepts)} · add_relations ${batchRowRepairSummary(addRelationsRowRepair?.relations)}`);
  console.log(`  batch row write metadata: add_concepts ${batchWriteMetadataAbsenceSummary(addConceptsRowRepair, addConceptsRowRepairStructured, "concepts")} · add_relations ${batchWriteMetadataAbsenceSummary(addRelationsRowRepair, addRelationsRowRepairStructured, "relations")}`);
  console.log(`  batch no-write metadata: ${batchNoWriteMetadataCoverageSummary({
    addConceptsPayload: addConceptsRowRepair,
    addConceptsStructuredPayload: addConceptsRowRepairStructured,
    addRelationsPayload: addRelationsRowRepair,
    addRelationsStructuredPayload: addRelationsRowRepairStructured,
  })}`);
  console.log(`  gate: ${failures.length === 0 ? `${COLORS.green}pass${COLORS.reset}` : `${COLORS.yellow}fail${COLORS.reset}`}`);

  const stderrWarnings = stderrWarningLines(stderr);
  if (stderrWarnings.length > 0) {
    console.log(
      `\n${COLORS.dim}[stderr warnings]${COLORS.reset}\n${stderrWarnings.slice(0, 5).join("\n")}`,
    );
  }

  if (failures.length > 0) {
    console.error(`\n${COLORS.yellow}dogfood walk failed gate:${COLORS.reset}`);
    for (const failure of failures) {
      console.error(`  - ${failure}`);
    }
    return 1;
  }
  return 0;
}
