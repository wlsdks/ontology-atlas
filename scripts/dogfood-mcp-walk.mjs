#!/usr/bin/env node
// AI-agent dogfood simulation: calls the MCP read tools in the order a user follows after
// registering .mcp.json. Never writes; destructive tools are dry-run only. The walk lives in
// scripts/lib/dogfood-walk/*.mjs.

import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { runDogfoodWalk as main } from "./lib/dogfood-walk/report.mjs";

export {
  toolsListAnnotationSummary,
  toolsListInventoryFailure,
} from "../mcp/scripts/verify/tools-list/inventory.mjs";

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
