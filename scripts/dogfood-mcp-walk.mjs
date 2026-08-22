#!/usr/bin/env node
// AI-agent dogfood simulation: calls the MCP server's read tools and the
// first-contact graph diagnosis in the same order a user follows after
// registering .mcp.json, measuring the quality of what a real agent gets back.
//
// Never writes (the dogfood vault must survive); destructive tools are dry-run
// only. list_kinds / list_concepts / project probe / get_concepts /
// find_evidence / find_path / find_backlinks / find_orphans /
// tools/list schema contract / strict unknown-tool, unknown-argument, invalid-enum, and invalid-filter rejection / validate_vault / compile_ontology(summary + indexed full artifact) /
// query_ontology overview / query_plan / neighbors / path / all_paths / pattern_walk / project_scope / centrality / communities / similar_nodes / explain_relation / reachability / impact / blast_radius / subgraph / schema / facets / match_nodes / match_edges / node_profile / lineage / containment_tree / cycles / topological_order / relation_check / components / recommend_relations / growth_plan / maintenance_plan / workspace_brief / health / health tuned.
//
// This file is a thin orchestrator. The walk itself is decomposed by seam under
// scripts/lib/dogfood-walk/*.mjs (cli args, rpc client, request builder, shape
// validators, gate evaluator, summaries, console report). Every symbol this file
// used to export is re-exported below from its new home so existing consumers
// (scripts/dogfood-mcp-walk.test.mjs, other scripts) keep working unchanged.

import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { runDogfoodWalk as main } from "./lib/dogfood-walk/report.mjs";

export { toolsListAnnotationSummary, toolsListInventoryFailure } from "../mcp/scripts/verify.mjs";

export {
  dogfoodUsage,
  shouldPrintDogfoodHelp,
  parseDogfoodArgs,
  parseDogfoodTimeoutMs,
  dogfoodTimeoutErrorMessage,
} from "./lib/dogfood-walk/cli-args.mjs";

export {
  DOGFOOD_RESPONSE_LABELS,
  expectedResponseIds,
  missingResponseLabels,
  parseRpcResponses,
  createUtf8Accumulator,
  shouldFinishRpc,
} from "./lib/dogfood-walk/rpc-client.mjs";

export {
  DOGFOOD_TUNED_HEALTH_ARGS,
  DOGFOOD_TUNED_WORKSPACE_BRIEF_NODE_LIMIT,
  graphStructuredContentSummary,
  structuredContentStatus,
  rpcTimeoutFailure,
  formatWorkspaceNextActionRows,
  workspaceNextActionSummary,
  workspaceNextActionAnalysisLabel,
  writeRowLabelGuidanceSummary,
  toolsListSchemaStatus,
  toolsListInventoryStatus,
  initializeInstructionStatus,
  strictClosestValueSummary,
  strictRepairSummary,
  writeMetadataAbsenceSummary,
  batchWriteMetadataAbsenceSummary,
  batchNoWriteMetadataCoverageSummary,
  batchRowRepairSummary,
  healthCheckStatusSummary,
  importModuleEdgeKindSummary,
  componentSummary,
  maintenanceBucketSummary,
  maintenanceNextActionSummary,
  tunedHealthScopeSummary,
  tunedWorkspaceBriefScopeSummary,
} from "./lib/dogfood-walk/summaries.mjs";

export {
  buildDogfoodDiscoveryRequests,
  buildDogfoodRequests,
  selectDogfoodTargets,
} from "./lib/dogfood-walk/request-builder.mjs";

export {
  recordResult,
  stderrWarningFailures,
  stderrWarningLines,
  evaluateDogfoodGate,
} from "./lib/dogfood-walk/gate-evaluator.mjs";

if (fileURLToPath(import.meta.url) === resolve(process.argv[1] ?? "")) {
  process.exitCode = await main().catch((err) => {
    console.error("dogfood walk failed:", err);
    return 1;
  });
}
