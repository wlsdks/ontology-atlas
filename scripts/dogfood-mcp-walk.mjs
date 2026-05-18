#!/usr/bin/env node
// R12 #38 — AI agent dogfood 시뮬. 사용자 .mcp.json 등록 후 시나리오와
// 같은 흐름으로 mcp server 에 read tool + first-contact graph diagnosis 호출.
// *진짜 AI agent 입장* 에서
// 받는 정보 quality 측정.
//
// write 안 함 (dogfood vault 보존). destructive tools are dry-run only. list_kinds / list_concepts / project probe / get_concepts /
// find_evidence / find_path / find_backlinks / find_orphans /
// tools/list schema contract / strict unknown-tool, unknown-argument, invalid-enum, and invalid-filter rejection / validate_vault / compile_ontology(summary + indexed full artifact) /
// query_ontology overview / query_plan / neighbors / path / all_paths / pattern_walk / project_scope / centrality / communities / similar_nodes / explain_relation / reachability / impact / blast_radius / subgraph / schema / facets / match_nodes / match_edges / node_profile / lineage / containment_tree / cycles / topological_order / relation_check / components / recommend_relations / growth_plan / maintenance_plan / workspace_brief / health / health tuned.

import { spawn } from "node:child_process";
import { StringDecoder } from "node:string_decoder";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";
import {
  expectedResponseIds,
  hasAllResponses,
  hasAnyErrorResponse,
  missingResponseLabels,
  parseJsonRpcResponses,
} from "../mcp/scripts/json-rpc-lines.mjs";
import {
  compileSummaryFailure,
  compileIndexesFailure,
  compileIndexesSummary,
  destructiveDryRunFailure,
  analyzeRepoStructureFailure,
  batchCapFailure,
  formatCount,
  inferImportsFailure,
  initializeInstructionsFailure,
  listConceptsFailure,
  listKindsFailure,
  overviewFailure,
  projectMapQueryPlanFailure,
  strictArgsFailure,
  strictMultiArgsFailure,
  strictEnumFailure,
  strictUnknownToolFailure,
  strictGraphKindFilterFailure,
  strictRecommendRelationsKindFilterFailure,
  strictMatchNodesSortFailure,
  strictMatchEdgesTypeFailure,
  strictFindNeighborsTypeFailure,
  strictFindOrphansKindFailure,
  strictQueryConceptsFilterFailure,
  strictListConceptsKindFailure,
  strictMaintenanceFilterFailure,
  strictAddRelationFailure,
  strictRelationFilterFailure,
  structuredContentMismatchSummary,
  structuredContentParityStatus,
  toolsListAnnotationSummary,
  toolsListInventoryFailure,
  toolsListSchemaFailure,
  TOOLS_LIST_SCHEMA_CONTRACT_SUMMARY,
  tunedHealthScopeOutputSummary,
  tunedWorkspaceBriefScopeOutputSummary,
  validateVaultFailure,
  VERIFY_TUNED_HEALTH_ARGS,
  VERIFY_TUNED_WORKSPACE_BRIEF_NODE_LIMIT,
  workspaceBriefSummary,
} from "../mcp/scripts/verify.mjs";

export { toolsListAnnotationSummary, toolsListInventoryFailure } from "../mcp/scripts/verify.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const SERVER = join(ROOT, "mcp", "src", "index.js");
const VAULT = join(ROOT, "docs", "ontology");
const DOGFOOD_TIMEOUT_MS_RAW = process.env.OMOT_DOGFOOD_TIMEOUT_MS;
export const DOGFOOD_TUNED_HEALTH_ARGS = VERIFY_TUNED_HEALTH_ARGS;
export const DOGFOOD_TUNED_WORKSPACE_BRIEF_NODE_LIMIT = VERIFY_TUNED_WORKSPACE_BRIEF_NODE_LIMIT;

export function dogfoodUsage() {
  return [
    "Usage:",
    "  pnpm dogfood:help",
    "  pnpm dogfood:walk -- [--help]",
    "  node scripts/dogfood-mcp-walk.mjs [--help]",
    "",
    "Runs the source-checkout MCP dogfood walk against this repo's docs/ontology vault.",
    "The walk starts the local MCP stdio server, exercises read/diagnosis/graph-query",
    "surfaces, and exits non-zero when the first-contact or dogfood gate regresses.",
    "No positional vault argument is accepted; this script intentionally dogfoods the",
    "repo's own ontology vault.",
    "",
    "Options:",
    "  -h, --help                 Print this help without starting the MCP server.",
    "",
    "Environment:",
    "  OMOT_DOGFOOD_TIMEOUT_MS   Positive integer wait window in milliseconds.",
    "                              Example: OMOT_DOGFOOD_TIMEOUT_MS=12000 pnpm dogfood:walk",
    "",
    "Lighter dogfood gates:",
    "  pnpm dogfood:compile       Fast compile_ontology summary over docs/ontology.",
    "  pnpm dogfood:health        Fail-closed health JSON gate over docs/ontology.",
    "  pnpm dogfood:brief         First-contact workspace_brief JSON snapshot over docs/ontology.",
    "  pnpm dogfood:verify        Installed-style verify gate over docs/ontology before the full walk.",
    "",
    "Focused checks:",
    "  pnpm test:mcp:dogfood           Dogfood helper, compile/index gates, tools/list inventory names + annotation coverage, row-label guidance, batch cap gates, strict closest-value and unknown-tool repair summary, vault warning and validate_vault problem gates, first-contact health/growth/sample-shape gates, maintenance work-queue shape + formatter checks, initialize safety/recovery guidance, destructive dry-run, help/argument/timeout handling, structuredContent, strict relation filters, strict add_relation type-preflight, strict graph kind filters, stderr warning checks.",
    "  pnpm test:mcp:dogfood:timeout   Narrow dogfood timeout/help retry diagnostics.",
    "  pnpm dogfood:test               Full dogfood helper regression suite when focused checks are not enough.",
  ].join("\n");
}

export function shouldPrintDogfoodHelp(argv = process.argv.slice(2)) {
  return parseDogfoodArgs(argv).help;
}

export function parseDogfoodArgs(argv = process.argv.slice(2)) {
  const args = (Array.isArray(argv) ? argv : []).filter((arg) => arg !== "--");
  const help = args.includes("--help") || args.includes("-h");
  const unsupported = args.filter((arg) => arg !== "--help" && arg !== "-h");
  if (help) return { help: true, error: null };
  if (unsupported.length > 0) {
    return {
      help: false,
      error: formatUnsupportedDogfoodArgs(unsupported),
    };
  }
  return { help: false, error: null };
}

function formatUnsupportedDogfoodArgs(args) {
  const values = args.join(", ");
  const suggestion = args.length === 1 ? closestDogfoodOption(args[0]) : null;
  const suffix = suggestion ? `. Did you mean ${suggestion}?` : "";
  return `dogfood:walk does not accept arguments: ${values}${suffix}`;
}

function closestDogfoodOption(arg) {
  if (!arg || !String(arg).startsWith("-")) return null;
  const allowed = ["--help", "-h"];
  let best = null;
  for (const option of allowed) {
    const distance = levenshteinDistance(String(arg), option);
    if (!best || distance < best.distance) {
      best = { option, distance };
    }
  }
  return best && best.distance <= 2 ? best.option : null;
}

function levenshteinDistance(a, b) {
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  const current = Array.from({ length: b.length + 1 }, () => 0);
  for (let i = 1; i <= a.length; i += 1) {
    current[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const substitutionCost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + substitutionCost,
      );
    }
    for (let j = 0; j <= b.length; j += 1) {
      previous[j] = current[j];
    }
  }
  return previous[b.length];
}

const DOGFOOD_RESPONSE_LABELS = new Map([
  [1, "initialize"],
  [2, "list_kinds"],
  [3, "list_concepts"],
  [4, "find_evidence"],
  [5, "find_path"],
  [6, "find_backlinks"],
  [7, "find_orphans"],
  [8, "validate_vault"],
  [9, "workspace_brief"],
  [10, "health"],
  [11, "compile_ontology"],
  [12, "pattern_walk"],
  [13, "all_paths"],
  [14, "all_paths_query_plan"],
  [15, "overview"],
  [16, "get_concepts"],
  [17, "project_map_query_plan"],
  [18, "project_map"],
  [19, "domain_profile"],
  [20, "domain_matrix"],
  [21, "components"],
  [22, "relation_check"],
  [23, "maintenance_plan"],
  [24, "growth_plan"],
  [25, "recommend_relations"],
  [26, "cycles"],
  [27, "topological_order"],
  [28, "lineage"],
  [29, "containment_tree"],
  [30, "reachability"],
  [31, "impact"],
  [32, "blast_radius"],
  [33, "subgraph"],
  [34, "schema"],
  [35, "facets"],
  [36, "match_nodes"],
  [37, "match_edges"],
  [38, "node_profile"],
  [39, "centrality"],
  [40, "communities"],
  [41, "similar_nodes"],
  [42, "explain_relation"],
  [43, "neighbors"],
  [44, "path"],
  [45, "project_scope"],
  [46, "strict_args"],
  [47, "strict_enum"],
  [48, "project_probe"],
  [49, "health_tuned"],
  [50, "workspace_brief_tuned"],
  [51, "strict_maintenance_phase_filter"],
  [52, "strict_maintenance_severity_filter"],
  [53, "strict_maintenance_kind_filter"],
  [54, "maintenance_plan_missing_cursor"],
  [55, "tools_list"],
  [56, "query_concepts"],
  [57, "analyze_repo_structure"],
  [58, "infer_imports"],
  [59, "strict_multi_args"],
  [60, "query_concepts_limited"],
  [61, "strict_relation_filter"],
  [62, "compile_ontology_indexes"],
  [63, "rename_concept_dry_run"],
  [64, "merge_concepts_dry_run"],
  [65, "delete_concept_dry_run"],
  [66, "strict_relation_check"],
  [67, "strict_graph_kind_filter"],
  [68, "strict_graph_from_kind_filter"],
  [69, "strict_graph_to_kind_filter"],
  [70, "strict_add_relation"],
  [71, "strict_recommend_relations_kind_filter"],
  [72, "strict_recommend_relations_unsupported_kind_filter"],
  [73, "strict_match_nodes_sort_filter"],
  [74, "strict_match_edges_type_filter"],
  [75, "strict_find_neighbors_type_filter"],
  [76, "strict_find_orphans_kind_filter"],
  [77, "strict_find_orphans_exclude_kind_filter"],
  [78, "strict_query_concepts_kind_filter"],
  [79, "strict_query_concepts_has_key_filter"],
  [80, "strict_list_concepts_kind_filter"],
  [81, "get_concepts_batch_cap"],
  [82, "add_concepts_batch_cap"],
  [83, "add_relations_batch_cap"],
  [84, "strict_unknown_tool"],
]);

const HEALTH_CHECK_STATUSES = new Set(["pass", "warn", "fail", "info"]);
const NEXT_ACTION_SEVERITIES = new Set(["info", "warn", "fail"]);
const RPC_WRITE_BATCH_SIZE = 40;

function rpc(requests, timeoutMs = 3000) {
  return new Promise((resolveP, rejectP) => {
    const expectedIds = expectedResponseIds(requests);
    const chunks = chunkRequests(requests, RPC_WRITE_BATCH_SIZE);
    const sentIds = new Set();
    let nextChunkIndex = 0;
    const proc = spawn(process.execPath, [SERVER], {
      env: { ...process.env, OMOT_VAULT: VAULT },
      stdio: ["pipe", "pipe", "pipe"],
    });
    const stdoutDecoder = createUtf8Accumulator();
    const stderrDecoder = createUtf8Accumulator();
    let stdout = "";
    let stderr = "";
    let completed = false;
    let timedOut = false;
    let timer = null;
    const writeNextChunk = () => {
      const chunk = chunks[nextChunkIndex];
      if (!chunk) return;
      nextChunkIndex += 1;
      for (const id of expectedResponseIds(chunk)) {
        sentIds.add(id);
      }
      proc.stdin.write(chunk.map((r) => JSON.stringify(r)).join("\n") + "\n");
    };
    proc.stdout.on("data", (b) => {
      stdout = stdoutDecoder.write(b);
      if (completed) return;
      if (hasAnyErrorResponse(stdout, expectedIds)) {
        completed = true;
        if (timer) clearTimeout(timer);
        proc.kill("SIGTERM");
        return;
      }
      while (nextChunkIndex < chunks.length && hasAllResponses(stdout, sentIds)) {
        writeNextChunk();
      }
      if (hasAllResponses(stdout, expectedIds)) {
        completed = true;
        if (timer) clearTimeout(timer);
        proc.kill("SIGTERM");
      }
    });
    proc.stderr.on("data", (b) => {
      stderr = stderrDecoder.write(b);
    });

    writeNextChunk();
    timer = setTimeout(() => {
      timedOut = true;
      proc.kill("SIGTERM");
    }, timeoutMs);

    proc.on("close", () => {
      if (timer) clearTimeout(timer);
      stdout = stdoutDecoder.end();
      stderr = stderrDecoder.end();
      const responses = parseRpcResponses(stdout);
      resolveP({ responses, stderr, timedOut });
    });
    proc.on("error", rejectP);
  });
}

function chunkRequests(requests, size) {
  const chunks = [];
  for (let index = 0; index < requests.length; index += size) {
    chunks.push(requests.slice(index, index + size));
  }
  return chunks;
}

export { DOGFOOD_RESPONSE_LABELS, expectedResponseIds, missingResponseLabels };

export function parseRpcResponses(stdout) {
  return parseJsonRpcResponses(stdout);
}

export function createUtf8Accumulator() {
  const decoder = new StringDecoder("utf8");
  let text = "";
  return {
    write(chunk) {
      text += decoder.write(chunk);
      return text;
    },
    end() {
      text += decoder.end();
      return text;
    },
  };
}

export function shouldFinishRpc(stdout, expectedIds) {
  return hasAnyErrorResponse(stdout, expectedIds) || hasAllResponses(stdout, expectedIds);
}

export function graphStructuredContentSummary(rows) {
  const expected = rows.filter(([, parsed]) => Boolean(parsed));
  const missing = expected.filter(([, parsed, structured]) => (
    structuredContentParityStatus(parsed, structured) === "missing"
  ));
  const mismatched = expected.filter(([, parsed, structured]) => (
    structuredContentParityStatus(parsed, structured) === "mismatch"
  ));
  const passed = expected.length - missing.length - mismatched.length;
  if (expected.length === 0) return "n/a";
  if (missing.length === 0 && mismatched.length === 0) {
    return `pass ${passed}/${expected.length}`;
  }
  const details = [];
  if (missing.length > 0) {
    details.push(`missing ${missing.length}: ${missing.map(([label]) => label).join(", ")}`);
  }
  if (mismatched.length > 0) {
    details.push(`mismatch ${mismatched.length}: ${mismatched.map(([label]) => label).join(", ")}`);
  }
  return `fail ${passed}/${expected.length} (${details.join("; ")})`;
}

export function structuredContentStatus(parsed, structured) {
  const status = structuredContentParityStatus(parsed, structured);
  if (status === "missing") {
    return `${COLORS.yellow}missing${COLORS.reset}`;
  }
  if (status === "mismatch") {
    return `${COLORS.yellow}mismatch${COLORS.reset} (${structuredContentMismatchSummary(parsed, structured)})`;
  }
  return `${COLORS.green}pass${COLORS.reset}`;
}

export function rpcTimeoutFailure(timeoutMs, missingLabels) {
  return [
    `rpc: timed out after ${timeoutMs}ms waiting for ${missingLabels.join(", ")}.`,
    "Increase OMOT_DOGFOOD_TIMEOUT_MS for slow dogfood runs.",
    "Example: OMOT_DOGFOOD_TIMEOUT_MS=12000 pnpm dogfood:walk",
  ].join(" ");
}

export function formatWorkspaceNextActionRows(actions, limit = 5) {
  if (!Array.isArray(actions)) return [];
  return actions.slice(0, limit).map((action) => {
    const severity = typeof action?.severity === "string" ? action.severity : "";
    const kind = typeof action?.kind === "string" ? action.kind : "";
    const id = typeof action?.id === "string" ? action.id : "";
    const count = Number.isInteger(action?.count) ? ` x${action.count}` : "";
    const message = typeof action?.message === "string" && action.message.length > 0 ? ` - ${action.message}` : "";
    return `  ${severity.padEnd(5)} ${kind.padEnd(30)} ${id}${count}${message}`;
  });
}

export function workspaceNextActionSummary(actions, limit = 3) {
  if (!Array.isArray(actions) || actions.length === 0) return "none";
  const shown = actions.slice(0, limit).map((action) => {
    const label = action?.id || action?.kind || "unknown";
    const severity = action?.severity || "unknown";
    const count = Number.isInteger(action?.count) ? `:${action.count}` : "";
    return `${label}:${severity}${count}`;
  });
  const suffix = actions.length > shown.length ? `, +${actions.length - shown.length} more` : "";
  return `${shown.join(", ")}${suffix}`;
}

export function workspaceNextActionAnalysisLabel(label) {
  return `${label} non-blocking nextActions`;
}

export function writeRowLabelGuidanceSummary(tools) {
  if (!Array.isArray(tools)) return "missing tools/list";
  const missing = [];
  const addConcepts = tools.find((tool) => tool?.name === "add_concepts");
  const addRelations = tools.find((tool) => tool?.name === "add_relations");

  if (!/concepts\[n\]/.test(addConcepts?.description || "")) {
    missing.push("add_concepts concepts[n]");
  }
  if (!/every unknown field/.test(addConcepts?.description || "") || !/Received fields/.test(addConcepts?.description || "")) {
    missing.push("add_concepts multi-field Received fields");
  }
  if (!/duplicate input slugs/.test(addConcepts?.description || "") || !/first-seen `concepts\[m\]`/.test(addConcepts?.description || "")) {
    missing.push("add_concepts duplicate first-seen");
  }
  if (!/relations\[n\]/.test(addRelations?.description || "")) {
    missing.push("add_relations relations[n]");
  }
  if (!/every unknown field/.test(addRelations?.description || "") || !/Received fields/.test(addRelations?.description || "")) {
    missing.push("add_relations multi-field Received fields");
  }
  if (!/unknown type/.test(addRelations?.description || "") || !/closest-value hint/.test(addRelations?.description || "")) {
    missing.push("add_relations closest-value type hint");
  }

  return missing.length > 0 ? `missing ${missing.join(", ")}` : "pass";
}

export function toolsListSchemaStatus(schemaFailure, options = {}) {
  if (schemaFailure) {
    return options.color ? `${COLORS.yellow}${schemaFailure}${COLORS.reset}` : schemaFailure;
  }
  const pass = options.color ? `${COLORS.green}pass${COLORS.reset}` : "pass";
  return `${pass} (${TOOLS_LIST_SCHEMA_CONTRACT_SUMMARY})`;
}

export function toolsListInventoryStatus(inventoryFailure, options = {}) {
  if (inventoryFailure) {
    return options.color ? `${COLORS.yellow}${inventoryFailure}${COLORS.reset}` : inventoryFailure;
  }
  const pass = options.color ? `${COLORS.green}pass${COLORS.reset}` : "pass";
  return `${pass} (missing/extra/duplicate/invalid names)`;
}

export function strictClosestValueSummary(response) {
  const rejected = response?.result?.isError === true;
  if (!rejected) return "rejected false";

  const text = response.result.content?.[0]?.text || "";
  const received = text.match(/Received: "([^"]+)"/i)?.[1] || null;
  const suggestion = text.match(/Did you mean "([^"]+)"\?/i)?.[1] || null;
  if (received && suggestion) return `rejected true (${received} -> ${suggestion})`;
  if (received) return `rejected true (${received}; no suggestion)`;
  return "rejected true";
}

export function strictRepairSummary(response) {
  const rejected = response?.result?.isError === true;
  if (!rejected) return "rejected false";

  const structured = response.result.structuredContent;
  if (structured && typeof structured === "object") {
    if (typeof structured.receivedTool === "string") {
      return repairArrowSummary("tool", structured.receivedTool, structured.suggestion, structured.allowedTools);
    }
    if (typeof structured.receivedArgument === "string") {
      return repairArrowSummary("arg", structured.receivedArgument, structured.suggestion, structured.allowedArguments);
    }
    if (Array.isArray(structured.unknownArguments) && structured.unknownArguments.length > 0) {
      const hints = structured.unknownArguments.map((row) => {
        const name = row?.name ?? "unknown";
        return typeof row?.suggestion === "string" ? `${name}->${row.suggestion}` : `${name}->?`;
      });
      return `rejected true (args ${hints.join(", ")}; allowed ${formatAllowedCount(structured.allowedArguments)})`;
    }
    if (typeof structured.receivedValue === "string") {
      return repairArrowSummary(structured.valueName || "value", structured.receivedValue, structured.suggestion, structured.allowedValues);
    }
  }

  return strictClosestValueSummary(response);
}

function repairArrowSummary(label, received, suggestion, allowed) {
  const arrow = typeof suggestion === "string" && suggestion.length > 0 ? `${received}->${suggestion}` : `${received}->?`;
  return `rejected true (${label} ${arrow}; allowed ${formatAllowedCount(allowed)})`;
}

function formatAllowedCount(values) {
  return Array.isArray(values) ? values.length : "n/a";
}

export function healthCheckStatusSummary(checks, limit = 5) {
  if (!Array.isArray(checks) || checks.length === 0) return "none";
  const shown = checks.slice(0, limit).map((check) => {
    const id = check?.id || "unknown";
    const status = check?.status || "unknown";
    const count = Number.isInteger(check?.count) ? `:${check.count}` : "";
    return `${id}:${status}${count}`;
  });
  const suffix = checks.length > shown.length ? `, +${checks.length - shown.length} more` : "";
  return `${shown.join(", ")}${suffix}`;
}

export function importModuleEdgeKindSummary(moduleEdges, limit = 3) {
  if (!Array.isArray(moduleEdges) || moduleEdges.length === 0) return "none";
  const shown = moduleEdges.slice(0, limit).map((edge) => {
    const from = typeof edge?.from === "string" && edge.from.length > 0 ? edge.from : "unknown";
    const to = typeof edge?.to === "string" && edge.to.length > 0 ? edge.to : "unknown";
    const count = Number.isInteger(edge?.count) ? edge.count : "n/a";
    const kindSummary = importKindCountSummary(edge?.kindCounts);
    const kindSuffix = kindSummary === "none" ? "" : ` (${kindSummary})`;
    return `${from}->${to} x${count}${kindSuffix}`;
  });
  const suffix = moduleEdges.length > shown.length ? `, +${moduleEdges.length - shown.length} more` : "";
  return `${shown.join(", ")}${suffix}`;
}

function importKindCountSummary(kindCounts) {
  if (!kindCounts || typeof kindCounts !== "object" || Array.isArray(kindCounts)) return "none";
  const ordered = ["static", "dynamic", "require", "reexport", "side"];
  const known = ordered
    .filter((kind) => Number.isInteger(kindCounts[kind]) && kindCounts[kind] > 0)
    .map((kind) => `${kind}:${kindCounts[kind]}`);
  const extra = Object.entries(kindCounts)
    .filter(([kind, count]) => !ordered.includes(kind) && Number.isInteger(count) && count > 0)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([kind, count]) => `${kind}:${count}`);
  const entries = [...known, ...extra];
  return entries.length > 0 ? entries.join("/") : "none";
}

export function componentSummary(result, limit = 3) {
  if (!result || !Array.isArray(result.components) || result.components.length === 0) return "none";
  const shown = result.components.slice(0, limit).map((component) => {
    const id = component?.id || "unknown";
    const size = Number.isInteger(component?.size) ? component.size : "n/a";
    const limited = component?.nodeLimited === true ? "+" : "";
    const first = component?.nodes?.[0]?.slug || "unknown";
    return `${id}:${size}${limited}:${first}`;
  });
  const suffix = result.components.length > shown.length ? `, +${result.components.length - shown.length} more` : "";
  return `${shown.join(", ")}${suffix}`;
}

export function maintenanceBucketSummary(bucket, limit = 5) {
  if (!bucket || typeof bucket !== "object" || Array.isArray(bucket)) return "n/a";
  const entries = Object.entries(bucket)
    .filter(([, count]) => Number.isInteger(count) && count > 0)
    .sort(([leftKey, leftCount], [rightKey, rightCount]) => rightCount - leftCount || leftKey.localeCompare(rightKey));
  if (entries.length === 0) return "none";
  const shown = entries.slice(0, limit).map(([key, count]) => `${key}:${count}`);
  const suffix = entries.length > shown.length ? `, +${entries.length - shown.length} more` : "";
  return `${shown.join(", ")}${suffix}`;
}

export function maintenanceNextActionSummary(action) {
  if (action === null) return "none";
  if (!action || typeof action !== "object" || Array.isArray(action)) return "n/a";
  const id = typeof action.id === "string" && action.id.length > 0 ? action.id : "unknown";
  const phase = typeof action.phase === "string" && action.phase.length > 0 ? action.phase : "unknown";
  const kind = typeof action.kind === "string" && action.kind.length > 0 ? action.kind : "unknown";
  const severity = typeof action.severity === "string" && action.severity.length > 0 ? action.severity : "unknown";
  const tool = typeof action.proposedAction?.tool === "string" && action.proposedAction.tool.length > 0
    ? ` -> ${action.proposedAction.tool}`
    : "";
  return `${id} ${phase}/${kind}:${severity}${tool}`;
}

export function parseDogfoodTimeoutMs(value, fallback = 5000) {
  if (value == null || value === "") return fallback;
  if (!/^[1-9]\d*$/.test(String(value))) return false;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : false;
}

export function dogfoodTimeoutErrorMessage(value) {
  const received = value == null ? "undefined" : JSON.stringify(String(value));
  return [
    "OMOT_DOGFOOD_TIMEOUT_MS must be a positive integer wait window in milliseconds.",
    `Received: ${received}.`,
    "Example: OMOT_DOGFOOD_TIMEOUT_MS=12000 pnpm dogfood:walk",
  ].join("\n");
}

export function tunedHealthScopeSummary(args = DOGFOOD_TUNED_HEALTH_ARGS) {
  return tunedHealthScopeOutputSummary(args);
}

export function tunedWorkspaceBriefScopeSummary(
  args = DOGFOOD_TUNED_HEALTH_ARGS,
  nodeLimit = DOGFOOD_TUNED_WORKSPACE_BRIEF_NODE_LIMIT,
) {
  return tunedWorkspaceBriefScopeOutputSummary(args, nodeLimit);
}

const init = [
  {
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "dogfood-walk", version: "0" },
    },
  },
  { jsonrpc: "2.0", method: "notifications/initialized" },
];

function call(id, name, args = {}) {
  return {
    jsonrpc: "2.0",
    id,
    method: "tools/call",
    params: { name, arguments: args },
  };
}

export function buildDogfoodRequests() {
  return [
    ...init,
    { jsonrpc: "2.0", id: 55, method: "tools/list", params: {} },
    call(2, "list_kinds"),
    call(3, "list_concepts", { limit: 30 }),
    call(48, "list_concepts", { kind: "project", limit: 1 }),
    call(16, "get_concepts", {
      slugs: ["project", "capabilities/mcp-server", "missing-dogfood-slug"],
    }),
    call(81, "get_concepts", {
      slugs: Array.from({ length: 51 }, (_, index) => `dogfood-slug-${index}`),
    }),
    call(4, "find_evidence", { title: "vault" }),
    call(5, "find_path", {
      from: "capabilities/mcp-server",
      to: "domains/vault-local-first",
    }),
    call(6, "find_backlinks", { slug: "capabilities/mcp-server" }),
    call(7, "find_orphans", {}),
    call(56, "query_concepts", { filter: "kind=capability AND domain=ai-agent-partner", limit: 5 }),
    call(60, "query_concepts", { filter: "slug!=project", limit: 1 }),
    call(57, "analyze_repo_structure", { rootPath: ROOT, maxDepth: 2 }),
    call(58, "infer_imports", { rootPath: ROOT, maxFiles: 5000 }),
    call(63, "rename_concept", {
      oldSlug: "capabilities/mcp-server",
      newSlug: "capabilities/mcp-server-dogfood-dry-run",
    }),
    call(64, "merge_concepts", {
      fromSlug: "capabilities/mcp-server",
      intoSlug: "domains/ai-agent-partner",
    }),
    call(65, "delete_concept", { slug: "capabilities/mcp-server" }),
    call(82, "add_concepts", {
      concepts: Array.from({ length: 51 }, (_, index) => ({
        slug: `capabilities/dogfood-batch-cap-${index}`,
        kind: "capability",
        title: `Dogfood Batch Cap ${index}`,
        domain: "ai-agent-partner",
      })),
    }),
    call(83, "add_relations", {
      relations: Array.from({ length: 51 }, (_, index) => ({
        from: "capabilities/mcp-server",
        to: `capabilities/dogfood-batch-cap-${index}`,
        type: "relates",
      })),
    }),
    call(8, "validate_vault", {}),
    call(9, "query_ontology", { operation: "workspace_brief", limit: 5 }),
    call(10, "query_ontology", { operation: "health" }),
    call(49, "query_ontology", {
      operation: "health",
      ...DOGFOOD_TUNED_HEALTH_ARGS,
    }),
    call(50, "query_ontology", {
      operation: "workspace_brief",
      limit: 5,
      ...DOGFOOD_TUNED_HEALTH_ARGS,
      nodeLimit: DOGFOOD_TUNED_WORKSPACE_BRIEF_NODE_LIMIT,
    }),
    call(11, "compile_ontology", { summary: true }),
    call(62, "compile_ontology", { nodesLimit: 1, edgesLimit: 1, includeIndexes: true }),
    call(12, "query_ontology", {
      operation: "pattern_walk",
      slug: "project",
      pattern: ["domains", "capabilities"],
      limit: 5,
    }),
    call(13, "query_ontology", {
      operation: "all_paths",
      from: "capabilities/mcp-server",
      to: "domains/vault-local-first",
      maxHops: 4,
      limit: 3,
    }),
    call(14, "query_ontology", {
      operation: "query_plan",
      targetOperation: "all_paths",
      from: "capabilities/mcp-server",
      to: "domains/vault-local-first",
      maxHops: 4,
    }),
    call(15, "query_ontology", { operation: "overview" }),
    call(17, "query_ontology", {
      operation: "query_plan",
      targetOperation: "project_map",
    }),
    call(18, "query_ontology", {
      operation: "project_map",
      itemLimit: 5,
    }),
    call(19, "query_ontology", {
      operation: "domain_profile",
      slug: "domains/ai-agent-partner",
      itemLimit: 5,
      limit: 5,
    }),
    call(20, "query_ontology", {
      operation: "domain_matrix",
      project: "project",
      limit: 10,
    }),
    call(21, "query_ontology", {
      operation: "components",
      limit: 5,
      nodeLimit: 5,
    }),
    call(22, "query_ontology", {
      operation: "relation_check",
      from: "capabilities/mcp-server",
      to: "domains/ai-agent-partner",
      type: "domain",
    }),
    call(23, "query_ontology", {
      operation: "maintenance_plan",
      limit: 5,
    }),
    call(54, "query_ontology", {
      operation: "maintenance_plan",
      afterActionId: "maint_missing",
      limit: 5,
    }),
    call(51, "query_ontology", {
      operation: "maintenance_plan",
      phases: ["repiar"],
    }),
    call(52, "query_ontology", {
      operation: "maintenance_plan",
      severities: ["fatal"],
    }),
    call(53, "query_ontology", {
      operation: "maintenance_plan",
      kinds: ["add_mising_relation"],
    }),
    call(61, "query_ontology", {
      operation: "health",
      dependencyTypes: ["depend_on"],
    }),
    call(66, "query_ontology", {
      operation: "relation_check",
      from: "missing-relation-check-source",
      to: "missing-relation-check-target",
      type: "depend_on",
    }),
    call(70, "add_relation", {
      from: "missing-add-relation-source",
      to: "missing-add-relation-target",
      type: "depend_on",
    }),
    call(67, "query_ontology", {
      operation: "match_nodes",
      kind: "capabilty",
    }),
    call(71, "query_ontology", {
      operation: "recommend_relations",
      kind: "capabilty",
    }),
    call(72, "query_ontology", {
      operation: "recommend_relations",
      kind: "domain",
    }),
    call(73, "query_ontology", {
      operation: "match_nodes",
      sort: "outDegre",
    }),
    call(74, "query_ontology", {
      operation: "match_edges",
      type: "depend_on",
    }),
    call(75, "find_neighbors", {
      slug: "missing-find-neighbors-type-source",
      types: ["depend_on"],
    }),
    call(76, "find_orphans", {
      kind: "capabilty",
    }),
    call(77, "find_orphans", {
      excludeKinds: ["capabilty"],
    }),
    call(78, "query_concepts", {
      filter: "kind=capabilty",
    }),
    call(79, "query_concepts", {
      filter: "has(capabilties)",
    }),
    call(80, "list_concepts", {
      kind: "capabilty",
    }),
    call(68, "query_ontology", {
      operation: "match_edges",
      fromKind: "capabilty",
    }),
    call(69, "query_ontology", {
      operation: "match_edges",
      toKind: "externl",
    }),
    call(24, "query_ontology", {
      operation: "growth_plan",
      limit: 5,
    }),
    call(25, "query_ontology", {
      operation: "recommend_relations",
      limit: 5,
    }),
    call(26, "query_ontology", {
      operation: "cycles",
      limit: 5,
    }),
    call(27, "query_ontology", {
      operation: "topological_order",
      limit: 10,
    }),
    call(28, "query_ontology", {
      operation: "lineage",
      slug: "capabilities/mcp-server",
      depth: 3,
      limit: 10,
    }),
    call(29, "query_ontology", {
      operation: "containment_tree",
      slug: "project",
      depth: 3,
      limit: 30,
    }),
    call(30, "query_ontology", {
      operation: "reachability",
      slug: "capabilities/mcp-server",
      direction: "outgoing",
      depth: 2,
      limit: 10,
    }),
    call(31, "query_ontology", {
      operation: "impact",
      slug: "capabilities/mcp-server",
      direction: "incoming",
      depth: 2,
      limit: 10,
    }),
    call(32, "query_ontology", {
      operation: "blast_radius",
      slug: "capabilities/mcp-server",
      direction: "incoming",
      depth: 2,
      limit: 10,
    }),
    call(33, "query_ontology", {
      operation: "subgraph",
      slug: "capabilities/mcp-server",
      direction: "both",
      depth: 1,
      limit: 12,
    }),
    call(34, "query_ontology", {
      operation: "schema",
      limit: 12,
    }),
    call(35, "query_ontology", {
      operation: "facets",
      limit: 8,
    }),
    call(36, "query_ontology", {
      operation: "match_nodes",
      kind: "capability",
      slugContains: "mcp",
      sort: "degree",
      limit: 8,
    }),
    call(37, "query_ontology", {
      operation: "match_edges",
      from: "capabilities/mcp-server",
      includeExternal: true,
      limit: 8,
    }),
    call(38, "query_ontology", {
      operation: "node_profile",
      slug: "capabilities/mcp-server",
      limit: 8,
    }),
    call(39, "query_ontology", {
      operation: "centrality",
      limit: 8,
    }),
    call(40, "query_ontology", {
      operation: "communities",
      limit: 6,
      nodeLimit: 6,
    }),
    call(41, "query_ontology", {
      operation: "similar_nodes",
      candidateSlug: "capabilities/mcp-server-v2",
      title: "MCP Server",
      kind: "capability",
      domain: "domains/ai-agent-partner",
      limit: 5,
    }),
    call(42, "query_ontology", {
      operation: "explain_relation",
      from: "capabilities/mcp-server",
      to: "domains/vault-local-first",
      maxHops: 4,
      limit: 5,
    }),
    call(43, "query_ontology", {
      operation: "neighbors",
      slug: "capabilities/mcp-server",
      limit: 8,
    }),
    call(44, "query_ontology", {
      operation: "path",
      from: "capabilities/mcp-server",
      to: "domains/vault-local-first",
      maxHops: 4,
    }),
    call(45, "query_ontology", {
      operation: "project_scope",
      project: "project",
      limit: 12,
    }),
    call(46, "list_concepts", { lmit: 1 }),
    call(59, "list_concepts", { lmit: 1, summry: true }),
    call(47, "query_ontology", { operation: "overveiw" }),
    call(84, "list_concept", { limit: 1 }),
  ];
}

function getResult(responses, id) {
  const res = responses.find((r) => r.id === id);
  if (!res) return null;
  if (res.error) return { error: res.error };
  const text = res.result?.content?.[0]?.text;
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { rawText: text };
  }
}

function getRpcResult(responses, id) {
  const res = responses.find((r) => r.id === id);
  if (!res) return null;
  if (res.error) return { error: res.error };
  return res.result ?? null;
}

function getRpcResponse(responses, id) {
  return responses.find((r) => r.id === id) ?? null;
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

export function strictRelationCheckFailure(response) {
  if (response?.result?.isError !== true) {
    return "strict relation_check response was not rejected";
  }
  const text = response.result.content?.[0]?.text || "";
  if (!/type must be one of/i.test(text)) {
    return "strict relation_check response did not report the invalid type filter";
  }
  if (!/Received: "depend_on"/i.test(text)) {
    return "strict relation_check response did not report the invalid type value";
  }
  if (!/Did you mean "depends_on"\?/i.test(text)) {
    return "strict relation_check response did not suggest the closest type value";
  }
  return null;
}

export function evaluateDogfoodGate({
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
  const strictRelationCheckError = strictRelationCheckFailure(strictRelationCheck);
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
    const listFailure = listConceptsFailure(list);
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
    const batchFailure = getConceptsShapeFailure(batch);
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
      if (!path.found) failures.push("find_path: expected mcp-server → vault-local-first path");
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
      if ((queryConceptsLimited.matches || []).some((row) => row?.slug === "project")) {
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
    const validationFailure = validateVaultFailure(validation);
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
    const patternWalkFailure = patternWalkShapeFailure(patternWalk);
    if (patternWalkFailure) failures.push(patternWalkFailure);
  }
  let allPathsFailure = null;
  if (allPaths) {
    allPathsFailure = allPathsShapeFailure(allPaths);
    if (allPathsFailure) failures.push(allPathsFailure);
  }
  let allPathsPlanFailure = null;
  if (allPathsPlan) {
    allPathsPlanFailure = allPathsPlanShapeFailure(allPathsPlan);
    if (allPathsPlanFailure) failures.push(allPathsPlanFailure);
  }
  if (projectMapPlan) {
    const projectMapPlanFailure = projectMapQueryPlanFailure(projectMapPlan);
    if (projectMapPlanFailure) failures.push(projectMapPlanFailure);
  }
  if (projectMap) {
    const projectMapFailure = projectMapShapeFailure(projectMap);
    if (projectMapFailure) failures.push(projectMapFailure);
  }
  if (domainProfile) {
    const domainProfileFailure = domainProfileShapeFailure(domainProfile);
    if (domainProfileFailure) failures.push(domainProfileFailure);
  }
  if (domainMatrix) {
    const domainMatrixFailure = domainMatrixShapeFailure(domainMatrix);
    if (domainMatrixFailure) failures.push(domainMatrixFailure);
  }
  if (components) {
    const componentsFailure = componentsShapeFailure(components);
    if (componentsFailure) failures.push(componentsFailure);
  }
  if (relationCheck) {
    const relationCheckFailure = relationCheckShapeFailure(relationCheck);
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
    const lineageFailure = lineageShapeFailure(lineage);
    if (lineageFailure) failures.push(lineageFailure);
  }
  if (containmentTree) {
    const containmentTreeFailure = containmentTreeShapeFailure(containmentTree);
    if (containmentTreeFailure) failures.push(containmentTreeFailure);
  }
  if (reachability) {
    const reachabilityFailure = reachabilityShapeFailure(reachability);
    if (reachabilityFailure) failures.push(reachabilityFailure);
  }
  if (impact) {
    const impactFailure = impactShapeFailure(impact);
    if (impactFailure) failures.push(impactFailure);
  }
  if (blastRadius) {
    const blastRadiusFailure = blastRadiusShapeFailure(blastRadius);
    if (blastRadiusFailure) failures.push(blastRadiusFailure);
  }
  if (subgraph) {
    const subgraphFailure = subgraphShapeFailure(subgraph);
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
    const matchNodesFailure = matchNodesShapeFailure(matchNodes);
    if (matchNodesFailure) failures.push(matchNodesFailure);
  }
  if (matchEdges) {
    const matchEdgesFailure = matchEdgesShapeFailure(matchEdges);
    if (matchEdgesFailure) failures.push(matchEdgesFailure);
  }
  if (nodeProfile) {
    const nodeProfileFailure = nodeProfileShapeFailure(nodeProfile);
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
    const similarNodesFailure = similarNodesShapeFailure(similarNodes);
    if (similarNodesFailure) failures.push(similarNodesFailure);
  }
  if (explainRelation) {
    const explainRelationFailure = explainRelationShapeFailure(explainRelation);
    if (explainRelationFailure) failures.push(explainRelationFailure);
  }
  if (neighbors) {
    const neighborsFailure = neighborsShapeFailure(neighbors);
    if (neighborsFailure) failures.push(neighborsFailure);
  }
  if (queryPath) {
    const queryPathFailure = queryPathShapeFailure(queryPath);
    if (queryPathFailure) failures.push(queryPathFailure);
  }
  if (projectScope) {
    const projectScopeFailure = projectScopeShapeFailure(projectScope);
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
  if (brief && !briefShapeFailure && brief.status !== "healthy") {
    failures.push(`workspace_brief: status ${brief.status} (${workspaceBriefSummary(brief)})`);
  }
  const briefFailedChecks = failedHealthChecks(brief?.health?.checks);
  if (briefFailedChecks.length > 0) {
    failures.push(`workspace_brief: failing health checks ${briefFailedChecks.join(", ")}`);
  }
  const blockingActions = blockingNextActions(brief?.nextActions);
  if (blockingActions.length > 0) {
    failures.push(`workspace_brief: actionable nextActions ${blockingActions.join(", ")}`);
  }
  if (tunedBrief && !tunedBriefShapeFailure && tunedBrief.status !== "healthy") {
    failures.push(`workspace_brief_tuned: status ${tunedBrief.status} (${workspaceBriefSummary(tunedBrief)})`);
  }
  const tunedBriefFailedChecks = failedHealthChecks(tunedBrief?.health?.checks);
  if (tunedBriefFailedChecks.length > 0) {
    failures.push(`workspace_brief_tuned: failing health checks ${tunedBriefFailedChecks.join(", ")}`);
  }
  const tunedBlockingActions = blockingNextActions(tunedBrief?.nextActions);
  if (tunedBlockingActions.length > 0) {
    failures.push(`workspace_brief_tuned: actionable nextActions ${tunedBlockingActions.join(", ")}`);
  }
  if (health && !healthShapeFailure && health.status !== "healthy") {
    failures.push(`health: status ${health.status} (${healthStatusSummary(health)})`);
  }
  const healthFailedChecks = failedHealthChecks(health?.checks);
  if (healthFailedChecks.length > 0) {
    failures.push(`health: failing health checks ${healthFailedChecks.join(", ")}`);
  }
  if (tunedHealth && !tunedHealthShapeFailure && tunedHealth.status !== "healthy") {
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

function recordStructuredContentFailure(failures, label, parsed, structured) {
  const status = structuredContentParityStatus(parsed, structured);
  if (status === "missing") {
    failures.push(`${label} structuredContent missing`);
    return;
  }
  if (status === "mismatch") {
    failures.push(structuredContentMismatchFailure(label, parsed, structured));
  }
}

function structuredContentMismatchFailure(label, parsed, structured) {
  return `${label} structuredContent mismatch — ${structuredContentMismatchSummary(parsed, structured)}`;
}

function evidenceShapeFailure(result) {
  if (!Array.isArray(result.matches)) {
    return "find_evidence response missing matches array";
  }
  return matchRowsFailure("find_evidence", result.matches);
}

function getConceptsShapeFailure(result) {
  if (!Array.isArray(result.concepts)) {
    return "get_concepts response missing concepts array";
  }
  if (result.concepts.length !== 3) {
    return `get_concepts response row count mismatch — expected 3, got ${result.concepts.length}`;
  }
  const [project, mcpServer, missing] = result.concepts;
  for (const [index, row] of [project, mcpServer].entries()) {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      return `get_concepts response malformed success row at index ${index}`;
    }
    if (row.ok !== true) {
      return `get_concepts response expected success row at index ${index}`;
    }
    if (!isNonBlankString(row.slug)) {
      return `get_concepts response missing success slug at index ${index}`;
    }
    if (!row.frontmatter || typeof row.frontmatter !== "object" || Array.isArray(row.frontmatter)) {
      return `get_concepts response missing frontmatter: ${row.slug}`;
    }
    if (typeof row.mtime !== "number" || !Number.isFinite(row.mtime)) {
      return `get_concepts response missing mtime: ${row.slug}`;
    }
  }
  if (!missing || typeof missing !== "object" || Array.isArray(missing)) {
    return "get_concepts response malformed missing row at index 2";
  }
  if (missing.ok !== false) {
    return "get_concepts response expected missing row to be ok:false";
  }
  if (missing.slug !== "missing-dogfood-slug") {
    return `get_concepts response missing row slug mismatch — ${missing.slug}`;
  }
  if (typeof missing.error !== "string" || !/not found/i.test(missing.error)) {
    return "get_concepts response missing row error";
  }
  return null;
}

function patternWalkShapeFailure(result) {
  if (result.operation !== "pattern_walk") {
    return "pattern_walk response operation mismatch";
  }
  if (!Array.isArray(result.pattern) || result.pattern.length === 0) {
    return "pattern_walk response missing pattern array";
  }
  if (!Array.isArray(result.layers)) {
    return "pattern_walk response missing layers array";
  }
  if (!Array.isArray(result.endNodes)) {
    return "pattern_walk response missing endNodes array";
  }
  if (!result.paths || !Array.isArray(result.paths.rows)) {
    return "pattern_walk response missing paths.rows array";
  }
  if (!Number.isInteger(result.paths.total) || result.paths.total < 0) {
    return "pattern_walk response missing paths.total";
  }
  if (typeof result.paths.limited !== "boolean") {
    return "pattern_walk response missing paths.limited flag";
  }
  if (result.paths.rows.length === 0) {
    return "pattern_walk response returned no rows";
  }
  if (result.paths.rows.length > result.paths.total) {
    return `pattern_walk response row count exceeds total — rows ${result.paths.rows.length}, total ${result.paths.total}`;
  }
  if (result.paths.limited && result.paths.total <= result.paths.rows.length) {
    return `pattern_walk response limited without hidden row — rows ${result.paths.rows.length}, total ${result.paths.total}`;
  }
  if (!result.paths.limited && result.paths.total !== result.paths.rows.length) {
    return `pattern_walk response total mismatch — rows ${result.paths.rows.length}, total ${result.paths.total}`;
  }
  for (let i = 0; i < result.paths.rows.length; i += 1) {
    const row = result.paths.rows[i];
    if (!Array.isArray(row.path) || row.path.length < 2) {
      return `pattern_walk response missing path at index ${i}`;
    }
    if (!row.end) {
      return `pattern_walk response missing end at index ${i}`;
    }
  }
  return null;
}

function allPathsShapeFailure(result) {
  if (result.operation !== "all_paths") {
    return "all_paths response operation mismatch";
  }
  if (typeof result.found !== "boolean") {
    return "all_paths response missing found flag";
  }
  if (!Number.isInteger(result.totalPaths) || result.totalPaths < 0) {
    return "all_paths response missing totalPaths";
  }
  if (typeof result.limited !== "boolean") {
    return "all_paths response missing limited flag";
  }
  if (!Array.isArray(result.paths)) {
    return "all_paths response missing paths array";
  }
  if (result.paths.length === 0) {
    return "all_paths response returned no paths";
  }
  if (result.paths.length > result.totalPaths) {
    return `all_paths response row count exceeds total — rows ${result.paths.length}, total ${result.totalPaths}`;
  }
  if (result.limited && result.totalPaths <= result.paths.length) {
    return `all_paths response limited without hidden path — rows ${result.paths.length}, total ${result.totalPaths}`;
  }
  if (!result.limited && result.totalPaths !== result.paths.length) {
    return `all_paths response total mismatch — rows ${result.paths.length}, total ${result.totalPaths}`;
  }
  for (let i = 0; i < result.paths.length; i += 1) {
    const row = result.paths[i];
    if (!Array.isArray(row.hops) || row.hops.length < 2) {
      return `all_paths response missing hops at index ${i}`;
    }
    if (!Array.isArray(row.edges)) {
      return `all_paths response missing edges at index ${i}`;
    }
  }
  const seen = new Set();
  for (let i = 0; i < result.paths.length; i += 1) {
    const row = result.paths[i];
    const relationChain = row.edges.map((edge) => edge?.via ?? "").join(">");
    const signature = `${row.hops.join(">")}|${relationChain}`;
    if (seen.has(signature)) {
      return `all_paths response duplicate path signature at index ${i}`;
    }
    seen.add(signature);
  }
  return null;
}

function allPathsPlanShapeFailure(result) {
  if (result.operation !== "query_plan") {
    return "all_paths query_plan response operation mismatch";
  }
  if (result.targetOperation !== "all_paths") {
    return "all_paths query_plan targetOperation mismatch";
  }
  if (result.sideEffect !== false) {
    return "all_paths query_plan must be side-effect-free";
  }
  if (!result.normalized || result.normalized.targetOperation !== "all_paths") {
    return "all_paths query_plan missing normalized targetOperation";
  }
  if (result.normalized.limit !== 25) {
    return `all_paths query_plan default limit mismatch — expected 25, got ${result.normalized.limit}`;
  }
  if (result.normalized.from !== "capabilities/mcp-server") {
    return `all_paths query_plan normalized from mismatch — ${result.normalized.from}`;
  }
  if (result.normalized.to !== "domains/vault-local-first") {
    return `all_paths query_plan normalized to mismatch — ${result.normalized.to}`;
  }
  if (!result.estimate || result.estimate.strategy !== "bounded_path_enumeration") {
    return "all_paths query_plan missing bounded path estimate";
  }
  if (!Number.isInteger(result.estimate.resultUpperBound) || result.estimate.resultUpperBound < 0) {
    return "all_paths query_plan missing resultUpperBound";
  }
  if (result.estimate.resultUpperBound > result.normalized.limit) {
    return `all_paths query_plan resultUpperBound exceeds limit — upper ${result.estimate.resultUpperBound}, limit ${result.normalized.limit}`;
  }
  if (!["low", "medium", "high"].includes(result.estimate.costClass)) {
    return "all_paths query_plan missing costClass";
  }
  if (!Array.isArray(result.warnings)) {
    return "all_paths query_plan missing warnings array";
  }
  return null;
}

function neighborsShapeFailure(result) {
  if (result.operation !== "neighbors") {
    return `neighbors response operation mismatch — ${result.operation}`;
  }
  if (result.center !== "capabilities/mcp-server") {
    return `neighbors response center mismatch — ${result.center}`;
  }
  if (!result.node || result.node.slug !== result.center) {
    return "neighbors response missing center node";
  }
  if (!Number.isInteger(result.total) || result.total < 0) {
    return "neighbors response missing total";
  }
  if (typeof result.limited !== "boolean") {
    return "neighbors response missing limited flag";
  }
  if (!Array.isArray(result.edges)) {
    return "neighbors response missing edges";
  }
  if (result.edges.length === 0) {
    return "neighbors response returned no edges";
  }
  if (result.edges.length > result.total) {
    return `neighbors edges exceed total — edges ${result.edges.length}, total ${result.total}`;
  }
  if (!result.limited && result.edges.length !== result.total) {
    return `neighbors edge count mismatch — edges ${result.edges.length}, total ${result.total}`;
  }
  if (!Array.isArray(result.nodes)) {
    return "neighbors response missing nodes";
  }
  for (const [index, edge] of result.edges.entries()) {
    const edgeFailure = graphEdgeFailure("neighbors edge", edge, index);
    if (edgeFailure) return edgeFailure;
    if (!["incoming", "outgoing"].includes(edge.direction)) {
      return `neighbors edge missing direction at index ${index}`;
    }
    if (edge.direction === "incoming" && edge.to !== result.center) {
      return `neighbors incoming edge does not target center at index ${index}`;
    }
    if (edge.direction === "outgoing" && edge.from !== result.center) {
      return `neighbors outgoing edge does not start at center at index ${index}`;
    }
  }
  const nodeFailure = matchRowsFailure("neighbors nodes", result.nodes);
  if (nodeFailure) return nodeFailure;
  return null;
}

function queryPathShapeFailure(result) {
  if (result.operation !== "path") {
    return `path operation response mismatch — ${result.operation}`;
  }
  if (result.from !== "capabilities/mcp-server") {
    return `path operation from mismatch — ${result.from}`;
  }
  if (result.to !== "domains/vault-local-first") {
    return `path operation to mismatch — ${result.to}`;
  }
  const pathFailure = pathShapeFailure(result);
  if (pathFailure) return pathFailure.replace("find_path", "path operation");
  if (!result.found) {
    return "path operation expected mcp-server → vault-local-first path";
  }
  if (!Array.isArray(result.edges)) {
    return "path operation response missing edges";
  }
  if (result.edges.length !== result.hopCount) {
    return `path operation edge mismatch — edges ${result.edges.length}, hopCount ${result.hopCount}`;
  }
  for (const [index, edge] of result.edges.entries()) {
    const edgeFailure = graphEdgeFailure("path operation edge", edge, index);
    if (edgeFailure) return edgeFailure;
    if (edge.traversedFrom !== result.hops[index] || edge.traversedTo !== result.hops[index + 1]) {
      return `path operation traversal mismatch at index ${index}`;
    }
  }
  return null;
}

function projectScopeShapeFailure(result) {
  if (result.operation !== "project_scope") {
    return `project_scope response operation mismatch — ${result.operation}`;
  }
  if (result.project !== "project") {
    return `project_scope response project mismatch — ${result.project}`;
  }
  if (!result.node || result.node.slug !== result.project) {
    return "project_scope response missing project node";
  }
  const summaryFailure = numericSummaryFailure("project_scope", result.summary, [
    "nodes",
    "internalEdges",
    "boundaryEdges",
    "externalEdges",
    "unresolvedEdges",
  ]);
  if (summaryFailure) return summaryFailure;
  if (!result.byKind || typeof result.byKind !== "object" || Array.isArray(result.byKind)) {
    return "project_scope response missing byKind";
  }
  if (!result.byDomain || typeof result.byDomain !== "object" || Array.isArray(result.byDomain)) {
    return "project_scope response missing byDomain";
  }
  const nodesFailure = summarizedRowBucketFailure("project_scope nodes", result.nodes, result.summary.nodes);
  if (nodesFailure) return nodesFailure;
  const kindTotal = Object.values(result.byKind).reduce((sum, count) => sum + (Number.isInteger(count) ? count : 0), 0);
  if (kindTotal !== result.summary.nodes) {
    return `project_scope byKind count mismatch — summary ${result.summary.nodes}, byKind ${kindTotal}`;
  }
  if (!result.edges || typeof result.edges !== "object" || Array.isArray(result.edges)) {
    return "project_scope response missing edges";
  }
  const expectedTotals = {
    internal: result.summary.internalEdges,
    boundary: result.summary.boundaryEdges,
    external: result.summary.externalEdges,
    unresolved: result.summary.unresolvedEdges,
  };
  for (const [key, expectedTotal] of Object.entries(expectedTotals)) {
    const edgeFailure = scopeEdgeBucketFailure(`project_scope ${key} edges`, result.edges[key]);
    if (edgeFailure) return edgeFailure;
    if (result.edges[key].total !== expectedTotal) {
      return `project_scope ${key} edge total mismatch — summary ${expectedTotal}, bucket ${result.edges[key].total}`;
    }
  }
  return null;
}

function projectMapShapeFailure(result) {
  if (result.operation !== "project_map") {
    return `project_map response operation mismatch — ${result.operation}`;
  }
  if (typeof result.project !== "string" || result.project.length === 0) {
    return "project_map response missing project";
  }
  const summaryFailure = numericSummaryFailure("project_map", result.summary, [
    "nodes",
    "domains",
    "capabilities",
    "elements",
    "unassignedNodes",
    "internalEdges",
    "boundaryEdges",
    "externalEdges",
    "unresolvedEdges",
  ]);
  if (summaryFailure) return summaryFailure;
  if (typeof result.limited !== "boolean") {
    return "project_map response missing limited flag";
  }
  if (!Array.isArray(result.domains)) {
    return "project_map response missing domains array";
  }
  if (result.domains.length === 0) {
    return "project_map response returned no domains";
  }
  if (result.domains.length > result.summary.domains) {
    return `project_map response domains exceed summary — domains ${result.domains.length}, summary ${result.summary.domains}`;
  }
  if (!result.limited && result.domains.length !== result.summary.domains) {
    return `project_map response domain count mismatch — domains ${result.domains.length}, summary ${result.summary.domains}`;
  }
  for (const [index, domain] of result.domains.entries()) {
    if (!domain || typeof domain !== "object" || Array.isArray(domain)) {
      return `project_map response malformed domain at index ${index}`;
    }
    if (typeof domain.slug !== "string" || domain.slug.length === 0) {
      return `project_map response missing domain slug at index ${index}`;
    }
    const domainSummaryFailure = numericSummaryFailure("project_map domain", domain.summary, [
      "nodes",
      "capabilities",
      "elements",
      "internalEdges",
      "boundaryEdges",
      "externalEdges",
      "unresolvedEdges",
    ]);
    if (domainSummaryFailure) return `${domainSummaryFailure}: ${domain.slug}`;
    const capabilitiesFailure = summarizedNodeBucketFailure(`project_map capabilities: ${domain.slug}`, domain.capabilities);
    if (capabilitiesFailure) return capabilitiesFailure;
    const elementsFailure = summarizedNodeBucketFailure(`project_map elements: ${domain.slug}`, domain.elements);
    if (elementsFailure) return elementsFailure;
    if (domain.capabilities.total !== domain.summary.capabilities) {
      return `project_map capabilities total mismatch — ${domain.slug}: summary ${domain.summary.capabilities}, bucket ${domain.capabilities.total}`;
    }
    if (domain.elements.total !== domain.summary.elements) {
      return `project_map elements total mismatch — ${domain.slug}: summary ${domain.summary.elements}, bucket ${domain.elements.total}`;
    }
  }
  const unassignedFailure = summarizedNodeBucketFailure("project_map unassigned", result.unassigned);
  if (unassignedFailure) return unassignedFailure;
  if (!Array.isArray(result.hotspots)) {
    return "project_map response missing hotspots array";
  }
  return matchRowsFailure("project_map hotspots", result.hotspots);
}

function domainProfileShapeFailure(result) {
  if (result.operation !== "domain_profile") {
    return `domain_profile response operation mismatch — ${result.operation}`;
  }
  if (result.domain !== "domains/ai-agent-partner") {
    return `domain_profile response domain mismatch — ${result.domain}`;
  }
  if (!result.node || result.node.slug !== result.domain) {
    return "domain_profile response missing domain node";
  }
  if (!result.parents || !Array.isArray(result.parents.projects)) {
    return "domain_profile response missing parent projects";
  }
  const summaryFailure = numericSummaryFailure("domain_profile", result.summary, [
    "nodes",
    "capabilities",
    "elements",
    "internalEdges",
    "boundaryEdges",
    "externalEdges",
    "unresolvedEdges",
  ]);
  if (summaryFailure) return summaryFailure;
  const capabilitiesFailure = summarizedNodeBucketFailure("domain_profile capabilities", result.capabilities);
  if (capabilitiesFailure) return capabilitiesFailure;
  const elementsFailure = summarizedNodeBucketFailure("domain_profile elements", result.elements);
  if (elementsFailure) return elementsFailure;
  if (result.capabilities.total !== result.summary.capabilities) {
    return `domain_profile capabilities total mismatch — summary ${result.summary.capabilities}, bucket ${result.capabilities.total}`;
  }
  if (result.elements.total !== result.summary.elements) {
    return `domain_profile elements total mismatch — summary ${result.summary.elements}, bucket ${result.elements.total}`;
  }
  if (!Array.isArray(result.hotspots)) {
    return "domain_profile response missing hotspots array";
  }
  const hotspotsFailure = matchRowsFailure("domain_profile hotspots", result.hotspots);
  if (hotspotsFailure) return hotspotsFailure;
  if (!result.edges || typeof result.edges !== "object" || Array.isArray(result.edges)) {
    return "domain_profile response missing edges block";
  }
  for (const key of ["boundary", "external", "unresolved"]) {
    const failure = scopeEdgeBucketFailure(`domain_profile ${key} edges`, result.edges[key]);
    if (failure) return failure;
  }
  return null;
}

function domainMatrixShapeFailure(result) {
  if (result.operation !== "domain_matrix") {
    return `domain_matrix response operation mismatch — ${result.operation}`;
  }
  if (result.project !== "project") {
    return `domain_matrix response project mismatch — ${result.project}`;
  }
  const summaryFailure = numericSummaryFailure("domain_matrix", result.summary, [
    "domains",
    "nodes",
    "assignedNodes",
    "unassignedNodes",
    "crossDomainEdges",
    "selfDomainEdges",
    "externalEdges",
    "unresolvedEdges",
  ]);
  if (summaryFailure) return summaryFailure;
  if (!Array.isArray(result.domains)) {
    return "domain_matrix response missing domains array";
  }
  if (result.domains.length !== result.summary.domains) {
    return `domain_matrix response domain count mismatch — domains ${result.domains.length}, summary ${result.summary.domains}`;
  }
  const assignedNodes = result.domains.reduce((sum, domain) => sum + (Number.isInteger(domain?.nodes) ? domain.nodes : 0), 0);
  if (assignedNodes !== result.summary.assignedNodes) {
    return `domain_matrix assigned node mismatch — summary ${result.summary.assignedNodes}, domains ${assignedNodes}`;
  }
  for (const [index, domain] of result.domains.entries()) {
    if (!domain || typeof domain !== "object" || Array.isArray(domain)) {
      return `domain_matrix response malformed domain at index ${index}`;
    }
    if (typeof domain.slug !== "string" || domain.slug.length === 0) {
      return `domain_matrix response missing domain slug at index ${index}`;
    }
    for (const key of ["nodes", "outgoing", "incoming", "selfEdges", "externalEdges", "unresolvedEdges"]) {
      if (!Number.isInteger(domain[key]) || domain[key] < 0) {
        return `domain_matrix domain missing ${key}: ${domain.slug}`;
      }
    }
  }
  if (!result.connections || typeof result.connections !== "object" || Array.isArray(result.connections)) {
    return "domain_matrix response missing connections";
  }
  if (!Number.isInteger(result.connections.total) || result.connections.total < 0) {
    return "domain_matrix connections missing total";
  }
  if (typeof result.connections.limited !== "boolean") {
    return "domain_matrix connections missing limited flag";
  }
  if (!Array.isArray(result.connections.rows)) {
    return "domain_matrix connections missing rows array";
  }
  if (result.connections.rows.length > result.connections.total) {
    return `domain_matrix connections rows exceed total — rows ${result.connections.rows.length}, total ${result.connections.total}`;
  }
  if (!result.connections.limited && result.connections.rows.length !== result.connections.total) {
    return `domain_matrix connections row count mismatch — rows ${result.connections.rows.length}, total ${result.connections.total}`;
  }
  for (const [index, row] of result.connections.rows.entries()) {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      return `domain_matrix connection malformed row at index ${index}`;
    }
    if (typeof row.from !== "string" || row.from.length === 0) {
      return `domain_matrix connection missing from at index ${index}`;
    }
    if (typeof row.to !== "string" || row.to.length === 0) {
      return `domain_matrix connection missing to at index ${index}`;
    }
    if (!Number.isInteger(row.count) || row.count <= 0) {
      return `domain_matrix connection missing count: ${row.from}->${row.to}`;
    }
    if (!row.byRelation || typeof row.byRelation !== "object" || Array.isArray(row.byRelation)) {
      return `domain_matrix connection missing byRelation: ${row.from}->${row.to}`;
    }
    if (!Array.isArray(row.examples)) {
      return `domain_matrix connection missing examples: ${row.from}->${row.to}`;
    }
  }
  return null;
}

function componentsShapeFailure(result) {
  if (result.operation !== "components") {
    return `components response operation mismatch — ${result.operation}`;
  }
  for (const key of ["totalComponents", "largestSize", "singletonCount"]) {
    if (!Number.isInteger(result[key]) || result[key] < 0) {
      return `components response missing ${key}`;
    }
  }
  if (typeof result.limited !== "boolean") {
    return "components response missing limited flag";
  }
  if (!Array.isArray(result.components)) {
    return "components response missing components array";
  }
  if (result.components.length > result.totalComponents) {
    return `components rows exceed total — rows ${result.components.length}, total ${result.totalComponents}`;
  }
  if (!result.limited && result.components.length !== result.totalComponents) {
    return `components row count mismatch — rows ${result.components.length}, total ${result.totalComponents}`;
  }
  const largestObserved = result.components.reduce((max, component) => Math.max(max, Number.isInteger(component?.size) ? component.size : 0), 0);
  if (result.components.length > 0 && result.largestSize < largestObserved) {
    return `components largestSize below returned component — largest ${result.largestSize}, observed ${largestObserved}`;
  }
  for (const [index, component] of result.components.entries()) {
    if (!component || typeof component !== "object" || Array.isArray(component)) {
      return `components malformed component at index ${index}`;
    }
    if (!Number.isInteger(component.id) || component.id <= 0) {
      return `components component missing id at index ${index}`;
    }
    if (!Number.isInteger(component.size) || component.size <= 0) {
      return `components component missing size at index ${index}`;
    }
    if (!component.kinds || typeof component.kinds !== "object" || Array.isArray(component.kinds)) {
      return `components component missing kinds: ${component.id}`;
    }
    if (typeof component.nodeLimited !== "boolean") {
      return `components component missing nodeLimited flag: ${component.id}`;
    }
    if (!Array.isArray(component.nodes)) {
      return `components component missing nodes: ${component.id}`;
    }
    if (component.nodes.length > component.size) {
      return `components component nodes exceed size: ${component.id}`;
    }
    if (!component.nodeLimited && component.nodes.length !== component.size) {
      return `components component node count mismatch: ${component.id}`;
    }
    const kindTotal = Object.values(component.kinds).reduce((sum, count) => sum + (Number.isInteger(count) ? count : 0), 0);
    if (kindTotal !== component.size) {
      return `components component kind count mismatch: ${component.id}`;
    }
    for (const [nodeIndex, node] of component.nodes.entries()) {
      if (!node || typeof node !== "object" || Array.isArray(node)) {
        return `components component malformed node: ${component.id}`;
      }
      if (typeof node.slug !== "string" || node.slug.length === 0) {
        return `components component missing node slug: ${component.id}/${nodeIndex}`;
      }
      if (typeof node.kind !== "string" || node.kind.length === 0) {
        return `components component missing node kind: ${component.id}/${node.slug}`;
      }
    }
  }
  return null;
}

function relationCheckShapeFailure(result) {
  if (result.operation !== "relation_check") {
    return `relation_check response operation mismatch — ${result.operation}`;
  }
  for (const key of ["from", "to", "relation", "fromKind", "toKind", "verdict"]) {
    if (typeof result[key] !== "string" || result[key].length === 0) {
      return `relation_check response missing ${key}`;
    }
  }
  if (typeof result.exists !== "boolean") {
    return "relation_check response missing exists flag";
  }
  if (!["already_exists", "matches_existing_schema", "new_schema_pattern"].includes(result.verdict)) {
    return `relation_check response unknown verdict — ${result.verdict}`;
  }
  if (!Array.isArray(result.matchingEdges)) {
    return "relation_check response missing matchingEdges array";
  }
  if (result.exists && result.matchingEdges.length === 0) {
    return "relation_check exists without matchingEdges";
  }
  if (!result.exists && result.verdict === "already_exists") {
    return "relation_check already_exists verdict without exists flag";
  }
  if (result.verdict === "new_schema_pattern" && result.schemaPattern !== null) {
    return "relation_check new_schema_pattern should not include schemaPattern";
  }
  if (result.verdict !== "new_schema_pattern") {
    if (!result.schemaPattern || typeof result.schemaPattern !== "object" || Array.isArray(result.schemaPattern)) {
      return "relation_check response missing schemaPattern";
    }
    for (const key of ["fromKind", "relation", "toKind"]) {
      if (typeof result.schemaPattern[key] !== "string" || result.schemaPattern[key].length === 0) {
        return `relation_check schemaPattern missing ${key}`;
      }
    }
    if (!Number.isInteger(result.schemaPattern.count) || result.schemaPattern.count <= 0) {
      return "relation_check schemaPattern missing count";
    }
    if (
      result.schemaPattern.fromKind !== result.fromKind ||
      result.schemaPattern.relation !== result.relation ||
      result.schemaPattern.toKind !== result.toKind
    ) {
      return "relation_check schemaPattern mismatch";
    }
  }
  for (const [index, edge] of result.matchingEdges.entries()) {
    if (!edge || typeof edge !== "object" || Array.isArray(edge)) {
      return `relation_check malformed matching edge at index ${index}`;
    }
    for (const key of ["from", "to", "via"]) {
      if (typeof edge[key] !== "string" || edge[key].length === 0) {
        return `relation_check matching edge missing ${key} at index ${index}`;
      }
    }
    if (edge.from !== result.from || edge.to !== result.to || edge.via !== result.relation) {
      return `relation_check matching edge mismatch at index ${index}`;
    }
  }
  return null;
}

function maintenancePlanShapeFailure(result, options = {}) {
  if (result.operation !== "maintenance_plan") {
    return `maintenance_plan response operation mismatch — ${result.operation}`;
  }
  if (result.sideEffect !== false) {
    return "maintenance_plan must be side-effect free";
  }
  if (typeof result.graphHash !== "string" || result.graphHash.length === 0) {
    return "maintenance_plan response missing graphHash";
  }
  const summaryFailure = numericSummaryFailure("maintenance_plan", result.summary, [
    "totalActions",
    "filteredActions",
    "remainingActions",
    "executableActions",
    "reviewActions",
    "compileIssues",
    "dependencyCycles",
    "canonicalizationActions",
    "danglingReferences",
    "relationRecommendations",
    "externalElementRefs",
    "externalElementRefsIgnored",
    "unassignedNodes",
    "emptyDomains",
  ]);
  if (summaryFailure) return summaryFailure;
  if (result.summary.executableActions + result.summary.reviewActions !== result.summary.totalActions) {
    return `maintenance_plan action count mismatch — executable ${result.summary.executableActions}, review ${result.summary.reviewActions}, total ${result.summary.totalActions}`;
  }
  if (result.summary.filteredActions > result.summary.totalActions) {
    return `maintenance_plan filteredActions exceeds totalActions — filtered ${result.summary.filteredActions}, total ${result.summary.totalActions}`;
  }
  if (result.summary.remainingActions > result.summary.filteredActions) {
    return `maintenance_plan remainingActions exceeds filteredActions — remaining ${result.summary.remainingActions}, filtered ${result.summary.filteredActions}`;
  }
  if (!result.filters || typeof result.filters !== "object" || Array.isArray(result.filters)) {
    return "maintenance_plan response missing filters";
  }
  if (typeof result.filters.executableOnly !== "boolean") {
    return "maintenance_plan filters missing executableOnly";
  }
  for (const key of ["phases", "severities", "kinds"]) {
    if (!Array.isArray(result.filters[key])) {
      return `maintenance_plan filters missing ${key}`;
    }
  }
  const cursorFailure = maintenanceCursorFailure(result.cursor);
  if (cursorFailure) return cursorFailure;
  if (options.expectReadyCursor) {
    if (result.cursor.found !== true) {
      return "maintenance_plan ready cursor did not report cursor.found=true";
    }
    if (result.cursor.reason !== null) {
      return "maintenance_plan ready cursor did not expose cursor.reason=null";
    }
  }
  for (const key of ["byPhase", "bySeverity", "byKind"]) {
    if (!result[key] || typeof result[key] !== "object" || Array.isArray(result[key])) {
      return `maintenance_plan response missing ${key}`;
    }
  }
  const bucketTotalFailure =
    maintenanceBucketTotalFailure(result.byPhase, result.summary.remainingActions, "byPhase") ||
    maintenanceBucketTotalFailure(result.bySeverity, result.summary.remainingActions, "bySeverity") ||
    maintenanceBucketTotalFailure(result.byKind, result.summary.remainingActions, "byKind");
  if (bucketTotalFailure) return bucketTotalFailure;
  if (typeof result.limited !== "boolean") {
    return "maintenance_plan response missing limited flag";
  }
  if (!Array.isArray(result.actions)) {
    return "maintenance_plan response missing actions array";
  }
  if (!result.limited && result.actions.length === result.summary.filteredActions) {
    const bucketFailure =
      maintenanceBucketMismatch(result.byPhase, result.actions, "phase", "byPhase") ||
      maintenanceBucketMismatch(result.bySeverity, result.actions, "severity", "bySeverity") ||
      maintenanceBucketMismatch(result.byKind, result.actions, "kind", "byKind");
    if (bucketFailure) return bucketFailure;
  }
  if (result.actions.length > result.summary.remainingActions) {
    return `maintenance_plan actions exceed remaining — actions ${result.actions.length}, remaining ${result.summary.remainingActions}`;
  }
  if (result.actions.length > 0 && result.cursor.nextAfterActionId !== result.actions[result.actions.length - 1].id) {
    return "maintenance_plan cursor nextAfterActionId does not match last action";
  }
  for (const key of ["nextExecutableAction", "nextReviewAction"]) {
    if (result[key] !== null && (!result[key] || typeof result[key] !== "object" || Array.isArray(result[key]))) {
      return `maintenance_plan malformed ${key}`;
    }
  }
  if (result.nextExecutableAction !== null) {
    const actionFailure = maintenanceActionFailure(result.nextExecutableAction, "nextExecutableAction");
    if (actionFailure) return actionFailure;
    if (result.nextExecutableAction.executable !== true) {
      return "maintenance_plan nextExecutableAction must be executable";
    }
  }
  if (result.nextReviewAction !== null) {
    const actionFailure = maintenanceActionFailure(result.nextReviewAction, "nextReviewAction");
    if (actionFailure) return actionFailure;
    if (result.nextReviewAction.executable !== false) {
      return "maintenance_plan nextReviewAction must be non-executable";
    }
  }
  if (result.cursor.found) {
    const firstExecutableAction = result.actions.find((action) => action?.executable === true);
    if (firstExecutableAction && result.nextExecutableAction?.id !== firstExecutableAction.id) {
      return "maintenance_plan nextExecutableAction does not match first executable page action";
    }
    const executablePointerFailure = maintenanceNextActionPointerFailure(
      firstExecutableAction,
      result.nextExecutableAction,
      "nextExecutableAction",
    );
    if (executablePointerFailure) return executablePointerFailure;
    if (!firstExecutableAction && result.nextExecutableAction !== null) {
      return "maintenance_plan unexpected nextExecutableAction outside current page";
    }
    const firstReviewAction = result.actions.find((action) => action?.executable === false);
    if (firstReviewAction && result.nextReviewAction?.id !== firstReviewAction.id) {
      return "maintenance_plan nextReviewAction does not match first review page action";
    }
    const reviewPointerFailure = maintenanceNextActionPointerFailure(
      firstReviewAction,
      result.nextReviewAction,
      "nextReviewAction",
    );
    if (reviewPointerFailure) return reviewPointerFailure;
    if (!firstReviewAction && result.nextReviewAction !== null) {
      return "maintenance_plan unexpected nextReviewAction outside current page";
    }
  }
  for (const [index, action] of result.actions.entries()) {
    const actionFailure = maintenanceActionFailure(action, index);
    if (actionFailure) return actionFailure;
  }
  return null;
}

function maintenanceNextActionPointerFailure(expectedAction, pointer, label) {
  if (!expectedAction || !pointer) return null;
  for (const key of ["executable", "phase", "kind", "severity"]) {
    if (pointer[key] !== expectedAction[key]) {
      return `maintenance_plan ${label} ${key} mismatch`;
    }
  }
  return null;
}

function maintenanceBucketTotalFailure(bucket, remainingActions, bucketName) {
  const total = Object.values(bucket).reduce((sum, count) => sum + (Number.isInteger(count) ? count : 0), 0);
  if (total !== remainingActions) {
    return `maintenance_plan ${bucketName} total mismatch — remaining ${remainingActions}, bucket ${total}`;
  }
  return null;
}

function maintenanceBucketMismatch(bucket, actions, actionKey, bucketName) {
  const expected = {};
  for (const action of actions) {
    const key = action?.[actionKey];
    if (typeof key === "string" && key.length > 0) {
      expected[key] = (expected[key] || 0) + 1;
    }
  }
  const bucketEntries = Object.entries(bucket);
  const expectedEntries = Object.entries(expected);
  if (bucketEntries.length !== expectedEntries.length) {
    return `maintenance_plan ${bucketName} mismatch`;
  }
  for (const [key, count] of expectedEntries) {
    if (bucket[key] !== count) return `maintenance_plan ${bucketName} mismatch`;
  }
  return null;
}

function maintenancePlanMissingCursorShapeFailure(result) {
  const shapeFailure = maintenancePlanShapeFailure(result);
  if (shapeFailure) return `missing-cursor smoke: ${shapeFailure}`;
  if (result.cursor?.found !== false) {
    return "maintenance_plan missing-cursor smoke did not report cursor.found=false";
  }
  if (result.cursor?.reason !== "afterActionId not found in filtered maintenance actions") {
    return "maintenance_plan missing-cursor smoke did not report the cursor miss reason";
  }
  if (result.cursor?.startIndex !== null) {
    return "maintenance_plan missing-cursor smoke should not expose a startIndex";
  }
  if ((result.actions || []).length !== 0) {
    return "maintenance_plan missing-cursor smoke returned actions";
  }
  if (result.summary?.remainingActions !== 0) {
    return "maintenance_plan missing-cursor smoke should have zero remaining actions";
  }
  if (result.nextExecutableAction !== null || result.nextReviewAction !== null) {
    return "maintenance_plan missing-cursor smoke should not expose next actions";
  }
  return null;
}

function maintenanceCursorFailure(cursor) {
  if (!cursor || typeof cursor !== "object" || Array.isArray(cursor)) {
    return "maintenance_plan response missing cursor";
  }
  if (cursor.afterActionId !== null && typeof cursor.afterActionId !== "string") {
    return "maintenance_plan cursor missing afterActionId";
  }
  if (typeof cursor.found !== "boolean") {
    return "maintenance_plan cursor missing found flag";
  }
  if (cursor.reason !== null && typeof cursor.reason !== "string") {
    return "maintenance_plan cursor missing reason";
  }
  if (!cursor.found && !cursor.reason) {
    return "maintenance_plan cursor not found without reason";
  }
  if (cursor.startIndex !== null && (!Number.isInteger(cursor.startIndex) || cursor.startIndex < 0)) {
    return "maintenance_plan cursor missing startIndex";
  }
  if (cursor.nextAfterActionId !== null && typeof cursor.nextAfterActionId !== "string") {
    return "maintenance_plan cursor missing nextAfterActionId";
  }
  if (typeof cursor.hasMore !== "boolean") {
    return "maintenance_plan cursor missing hasMore flag";
  }
  return null;
}

function maintenanceActionFailure(action, index) {
  if (!action || typeof action !== "object" || Array.isArray(action)) {
    return `maintenance_plan malformed action at index ${index}`;
  }
  for (const key of ["id", "phase", "kind", "severity", "reason"]) {
    if (typeof action[key] !== "string" || action[key].length === 0) {
      return `maintenance_plan action missing ${key} at index ${index}`;
    }
  }
  if (typeof action.score !== "number" || !Number.isFinite(action.score) || action.score < 0) {
    return `maintenance_plan action missing score: ${action.id}`;
  }
  if (typeof action.executable !== "boolean") {
    return `maintenance_plan action missing executable flag: ${action.id}`;
  }
  if (action.executable && (!action.proposedAction || typeof action.proposedAction !== "object" || Array.isArray(action.proposedAction))) {
    return `maintenance_plan executable action missing proposedAction: ${action.id}`;
  }
  if (action.proposedAction) {
    if (typeof action.proposedAction.tool !== "string" || action.proposedAction.tool.length === 0) {
      return `maintenance_plan proposedAction missing tool: ${action.id}`;
    }
    if (!action.proposedAction.args || typeof action.proposedAction.args !== "object" || Array.isArray(action.proposedAction.args)) {
      return `maintenance_plan proposedAction missing args: ${action.id}`;
    }
    const actionFailure = maintenanceProposedActionFailure(action);
    if (actionFailure) return actionFailure;
  }
  return null;
}

function maintenanceProposedActionFailure(action) {
  const { tool, args } = action.proposedAction;
  if (action.kind === "add_missing_relation") {
    if (tool !== "add_relation") {
      return `maintenance_plan proposedAction tool mismatch: ${action.id}`;
    }
    if (!action.nodes?.from?.slug || !action.nodes?.to?.slug) {
      return `maintenance_plan add_missing_relation missing node summaries: ${action.id}`;
    }
    if (args.from !== action.nodes.from.slug || args.to !== action.nodes.to.slug) {
      return `maintenance_plan proposedAction endpoint mismatch: ${action.id}`;
    }
    if (typeof args.type !== "string" || args.type.length === 0) {
      return `maintenance_plan proposedAction missing relation type: ${action.id}`;
    }
  }
  if (action.kind === "canonicalize_graph_arrays") {
    if (tool !== "patch_concept") {
      return `maintenance_plan proposedAction tool mismatch: ${action.id}`;
    }
    if (action.node?.slug && args.slug !== action.node.slug) {
      return `maintenance_plan proposedAction slug mismatch: ${action.id}`;
    }
  }
  if (action.kind === "materialize_external_element" || action.kind === "resolve_dangling_reference") {
    if (tool !== "add_concept") {
      return `maintenance_plan proposedAction tool mismatch: ${action.id}`;
    }
    if (typeof args.slug !== "string" || args.slug.length === 0) {
      return `maintenance_plan proposedAction missing slug: ${action.id}`;
    }
    if (action.kind === "materialize_external_element" && args.kind !== "element") {
      return `maintenance_plan proposedAction kind mismatch: ${action.id}`;
    }
  }
  return null;
}

function growthPlanShapeFailure(result) {
  if (result.operation !== "growth_plan") {
    return `growth_plan response operation mismatch — ${result.operation}`;
  }
  const summaryFailure = numericSummaryFailure("growth_plan", result.summary, [
    "relationRecommendations",
    "externalElementRefs",
    "externalElementRefsIgnored",
    "danglingReferences",
    "unassignedNodes",
    "emptyDomains",
    "totalActions",
  ]);
  if (summaryFailure) return summaryFailure;
  const totalActions = result.summary.relationRecommendations + result.summary.externalElementRefs + result.summary.danglingReferences;
  if (result.summary.totalActions !== totalActions) {
    return `growth_plan totalActions mismatch — summary ${result.summary.totalActions}, computed ${totalActions}`;
  }
  const recommendationsFailure = relationRecommendationsShapeFailure(result.relationRecommendations, result.summary.relationRecommendations);
  if (recommendationsFailure) return recommendationsFailure;
  for (const [key, total] of [
    ["externalElementRefs", result.summary.externalElementRefs],
    ["danglingReferences", result.summary.danglingReferences],
    ["unassignedNodes", result.summary.unassignedNodes],
    ["emptyDomains", result.summary.emptyDomains],
  ]) {
    const groupFailure = candidateGroupShapeFailure(`growth_plan.${key}`, result[key], total);
    if (groupFailure) return groupFailure;
  }
  if ((result.externalElementRefs.ignored ?? 0) !== result.summary.externalElementRefsIgnored) {
    return `growth_plan ignored external refs mismatch — summary ${result.summary.externalElementRefsIgnored}, group ${result.externalElementRefs.ignored ?? 0}`;
  }
  return null;
}

function relationRecommendationsShapeFailure(group, expectedTotal) {
  if (!group || typeof group !== "object" || Array.isArray(group)) {
    return "growth_plan response missing relationRecommendations";
  }
  if (group.operation !== "recommend_relations") {
    return `growth_plan relationRecommendations operation mismatch — ${group.operation}`;
  }
  if (group.mode !== "domain_containment") {
    return `growth_plan relationRecommendations mode mismatch — ${group.mode}`;
  }
  if (!Number.isInteger(group.totalRecommendations) || group.totalRecommendations < 0) {
    return "growth_plan relationRecommendations missing totalRecommendations";
  }
  if (group.totalRecommendations !== expectedTotal) {
    return `growth_plan relationRecommendations total mismatch — summary ${expectedTotal}, group ${group.totalRecommendations}`;
  }
  if (typeof group.limited !== "boolean") {
    return "growth_plan relationRecommendations missing limited flag";
  }
  if (!Array.isArray(group.recommendations)) {
    return "growth_plan relationRecommendations missing recommendations";
  }
  if (group.recommendations.length > group.totalRecommendations) {
    return `growth_plan relationRecommendations rows exceed total — rows ${group.recommendations.length}, total ${group.totalRecommendations}`;
  }
  if (!group.limited && group.recommendations.length !== group.totalRecommendations) {
    return `growth_plan relationRecommendations row count mismatch — rows ${group.recommendations.length}, total ${group.totalRecommendations}`;
  }
  for (const [index, row] of group.recommendations.entries()) {
    const rowFailure = growthCandidateRowFailure("growth_plan relationRecommendations", row, index, { requireProposedAction: true });
    if (rowFailure) return rowFailure;
  }
  return null;
}

function recommendRelationsShapeFailure(result) {
  const failure = relationRecommendationsShapeFailure(result, result?.totalRecommendations);
  if (failure) {
    return failure.replace(/^growth_plan relationRecommendations/, "recommend_relations");
  }
  return null;
}

function cyclesShapeFailure(result) {
  if (result.operation !== "cycles") {
    return `cycles response operation mismatch — ${result.operation}`;
  }
  if (!Array.isArray(result.relationTypes) || result.relationTypes.some((type) => typeof type !== "string" || type.length === 0)) {
    return "cycles response missing relationTypes";
  }
  if (!Number.isInteger(result.maxDepth) || result.maxDepth < 0) {
    return "cycles response missing maxDepth";
  }
  if (!Number.isInteger(result.totalCycles) || result.totalCycles < 0) {
    return "cycles response missing totalCycles";
  }
  if (typeof result.limited !== "boolean") {
    return "cycles response missing limited flag";
  }
  if (!Array.isArray(result.cycles)) {
    return "cycles response missing cycles array";
  }
  if (result.cycles.length > result.totalCycles) {
    return `cycles rows exceed total — rows ${result.cycles.length}, total ${result.totalCycles}`;
  }
  if (!result.limited && result.cycles.length !== result.totalCycles) {
    return `cycles row count mismatch — rows ${result.cycles.length}, total ${result.totalCycles}`;
  }
  for (const [index, cycle] of result.cycles.entries()) {
    if (!cycle || typeof cycle !== "object" || Array.isArray(cycle)) {
      return `cycles malformed cycle at index ${index}`;
    }
    if (typeof cycle.id !== "string" || cycle.id.length === 0) {
      return `cycles cycle missing id at index ${index}`;
    }
    if (!Number.isInteger(cycle.length) || cycle.length <= 0) {
      return `cycles cycle missing length: ${cycle.id}`;
    }
    if (!Array.isArray(cycle.nodes) || cycle.nodes.length !== cycle.length + 1) {
      return `cycles cycle node count mismatch: ${cycle.id}`;
    }
    if (cycle.nodes[0] !== cycle.nodes[cycle.nodes.length - 1]) {
      return `cycles cycle does not close: ${cycle.id}`;
    }
    if (!Array.isArray(cycle.edges) || cycle.edges.length !== cycle.length) {
      return `cycles cycle edge count mismatch: ${cycle.id}`;
    }
    for (const [edgeIndex, edge] of cycle.edges.entries()) {
      if (!edge || typeof edge !== "object" || Array.isArray(edge)) {
        return `cycles malformed edge: ${cycle.id}/${edgeIndex}`;
      }
      for (const key of ["from", "to", "via"]) {
        if (typeof edge[key] !== "string" || edge[key].length === 0) {
          return `cycles edge missing ${key}: ${cycle.id}/${edgeIndex}`;
        }
      }
    }
  }
  return null;
}

function topologicalOrderShapeFailure(result) {
  if (result.operation !== "topological_order") {
    return `topological_order response operation mismatch — ${result.operation}`;
  }
  if (!Array.isArray(result.relationTypes) || result.relationTypes.some((type) => typeof type !== "string" || type.length === 0)) {
    return "topological_order response missing relationTypes";
  }
  if (result.prerequisiteFirst !== true) {
    return "topological_order must be prerequisite-first";
  }
  if (typeof result.includeIsolated !== "boolean") {
    return "topological_order response missing includeIsolated";
  }
  if (typeof result.acyclic !== "boolean") {
    return "topological_order response missing acyclic flag";
  }
  for (const key of ["totalNodes", "orderedCount", "selectedEdges"]) {
    if (!Number.isInteger(result[key]) || result[key] < 0) {
      return `topological_order response missing ${key}`;
    }
  }
  if (result.orderedCount > result.totalNodes) {
    return `topological_order orderedCount exceeds totalNodes — ordered ${result.orderedCount}, total ${result.totalNodes}`;
  }
  if (typeof result.limited !== "boolean") {
    return "topological_order response missing limited flag";
  }
  if (!Array.isArray(result.order)) {
    return "topological_order response missing order";
  }
  if (result.order.length > result.orderedCount) {
    return `topological_order order exceeds orderedCount — rows ${result.order.length}, ordered ${result.orderedCount}`;
  }
  if (!result.limited && result.order.length !== result.orderedCount) {
    return `topological_order order count mismatch — rows ${result.order.length}, ordered ${result.orderedCount}`;
  }
  if (!Array.isArray(result.layers)) {
    return "topological_order response missing layers";
  }
  if (!Array.isArray(result.blocked)) {
    return "topological_order response missing blocked";
  }
  if (result.acyclic && result.blocked.length > 0) {
    return "topological_order acyclic result has blocked nodes";
  }
  for (const [index, row] of result.order.entries()) {
    const rowFailure = topologicalNodeRowFailure("topological_order order", row, index, { requireRank: true });
    if (rowFailure) return rowFailure;
  }
  for (const [index, layer] of result.layers.entries()) {
    if (!layer || typeof layer !== "object" || Array.isArray(layer)) {
      return `topological_order malformed layer at index ${index}`;
    }
    if (!Number.isInteger(layer.rank) || layer.rank < 0) {
      return `topological_order layer missing rank at index ${index}`;
    }
    if (!Array.isArray(layer.nodes)) {
      return `topological_order layer missing nodes at rank ${layer.rank}`;
    }
    for (const [nodeIndex, node] of layer.nodes.entries()) {
      const rowFailure = topologicalNodeRowFailure(`topological_order layer ${layer.rank}`, node, nodeIndex);
      if (rowFailure) return rowFailure;
    }
  }
  for (const [index, row] of result.blocked.entries()) {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      return `topological_order malformed blocked row at index ${index}`;
    }
    if (typeof row.slug !== "string" || row.slug.length === 0) {
      return `topological_order blocked row missing slug at index ${index}`;
    }
    if (!Number.isInteger(row.remainingInDegree) || row.remainingInDegree <= 0) {
      return `topological_order blocked row missing remainingInDegree: ${row.slug}`;
    }
  }
  return null;
}

function topologicalNodeRowFailure(label, row, index, { requireRank = false } = {}) {
  if (!row || typeof row !== "object" || Array.isArray(row)) {
    return `${label} malformed row at index ${index}`;
  }
  if (requireRank && (!Number.isInteger(row.rank) || row.rank < 0)) {
    return `${label} row missing rank at index ${index}`;
  }
  const slug = typeof row.slug === "string" ? row.slug : row.node?.slug;
  if (typeof slug !== "string" || slug.length === 0) {
    return `${label} row missing slug at index ${index}`;
  }
  return null;
}

function lineageShapeFailure(result) {
  if (result.operation !== "lineage") {
    return `lineage response operation mismatch — ${result.operation}`;
  }
  if (result.center !== "capabilities/mcp-server") {
    return `lineage response center mismatch — ${result.center}`;
  }
  if (!Number.isInteger(result.depth) || result.depth < 0) {
    return "lineage response missing depth";
  }
  if (!result.node || result.node.slug !== result.center) {
    return "lineage response missing center node";
  }
  for (const key of ["ancestors", "descendants"]) {
    const bucketFailure = lineageBucketFailure(`lineage ${key}`, result[key]);
    if (bucketFailure) return bucketFailure;
  }
  if (!Array.isArray(result.edges)) {
    return "lineage response missing edges array";
  }
  for (const [index, edge] of result.edges.entries()) {
    const edgeFailure = graphEdgeFailure("lineage edge", edge, index);
    if (edgeFailure) return edgeFailure;
  }
  const ancestorSlugs = new Set(result.ancestors.nodes.map((row) => row.slug));
  const descendantSlugs = new Set(result.descendants.nodes.map((row) => row.slug));
  if (!ancestorSlugs.has("domains/ai-agent-partner")) {
    return "lineage response missing ai-agent-partner ancestor";
  }
  if (descendantSlugs.has(result.center) || ancestorSlugs.has(result.center)) {
    return "lineage response includes center in lineage rows";
  }
  return null;
}

function lineageBucketFailure(label, bucket) {
  if (!bucket || typeof bucket !== "object" || Array.isArray(bucket)) {
    return `${label} missing bucket`;
  }
  if (!Number.isInteger(bucket.total) || bucket.total < 0) {
    return `${label} missing total`;
  }
  if (typeof bucket.limited !== "boolean") {
    return `${label} missing limited flag`;
  }
  if (!Array.isArray(bucket.nodes)) {
    return `${label} missing nodes`;
  }
  if (bucket.nodes.length > bucket.total) {
    return `${label} nodes exceed total — nodes ${bucket.nodes.length}, total ${bucket.total}`;
  }
  if (!bucket.limited && bucket.nodes.length !== bucket.total) {
    return `${label} node count mismatch — nodes ${bucket.nodes.length}, total ${bucket.total}`;
  }
  for (const [index, row] of bucket.nodes.entries()) {
    const rowFailure = lineageNodeFailure(label, row, index);
    if (rowFailure) return rowFailure;
  }
  return null;
}

function lineageNodeFailure(label, row, index) {
  if (!row || typeof row !== "object" || Array.isArray(row)) {
    return `${label} malformed row at index ${index}`;
  }
  if (typeof row.slug !== "string" || row.slug.length === 0) {
    return `${label} row missing slug at index ${index}`;
  }
  if (!row.node || row.node.slug !== row.slug) {
    return `${label} row missing node summary: ${row.slug}`;
  }
  if (!Number.isInteger(row.distance) || row.distance <= 0) {
    return `${label} row missing distance: ${row.slug}`;
  }
  if (typeof row.via !== "string" || row.via.length === 0) {
    return `${label} row missing via: ${row.slug}`;
  }
  return null;
}

function containmentTreeShapeFailure(result) {
  if (result.operation !== "containment_tree") {
    return `containment_tree response operation mismatch — ${result.operation}`;
  }
  if (result.root !== "project") {
    return `containment_tree response root mismatch — ${result.root}`;
  }
  for (const key of ["depth", "totalRoots", "emittedNodes"]) {
    if (!Number.isInteger(result[key]) || result[key] < 0) {
      return `containment_tree response missing ${key}`;
    }
  }
  if (typeof result.limited !== "boolean") {
    return "containment_tree response missing limited flag";
  }
  if (!Array.isArray(result.roots)) {
    return "containment_tree response missing roots";
  }
  if (result.roots.length > result.totalRoots) {
    return `containment_tree roots exceed total — roots ${result.roots.length}, total ${result.totalRoots}`;
  }
  if (!result.limited && result.roots.length !== result.totalRoots) {
    return `containment_tree root count mismatch — roots ${result.roots.length}, total ${result.totalRoots}`;
  }
  if (!Array.isArray(result.cycles)) {
    return "containment_tree response missing cycles";
  }
  let countedNodes = 0;
  for (const [index, root] of result.roots.entries()) {
    const rootFailure = containmentNodeFailure(root, index, {
      expectedSlug: index === 0 ? "project" : null,
      expectedDistance: 0,
      path: [],
    });
    if (rootFailure) return rootFailure;
    countedNodes += countContainmentNodes(root);
  }
  if (countedNodes !== result.emittedNodes) {
    return `containment_tree emitted node mismatch — emitted ${result.emittedNodes}, counted ${countedNodes}`;
  }
  for (const [index, cycle] of result.cycles.entries()) {
    const edgeFailure = graphEdgeFailure("containment_tree cycle", cycle, index);
    if (edgeFailure) return edgeFailure;
    if (!Array.isArray(cycle.path) || cycle.path.length === 0) {
      return `containment_tree cycle missing path at index ${index}`;
    }
  }
  return null;
}

function containmentNodeFailure(row, index, { expectedSlug = null, expectedDistance = null, path = [] } = {}) {
  if (!row || typeof row !== "object" || Array.isArray(row)) {
    return `containment_tree malformed node at index ${index}`;
  }
  if (typeof row.slug !== "string" || row.slug.length === 0) {
    return `containment_tree node missing slug at index ${index}`;
  }
  if (expectedSlug && row.slug !== expectedSlug) {
    return `containment_tree root slug mismatch — ${row.slug}`;
  }
  if (!Number.isInteger(row.distance) || row.distance < 0) {
    return `containment_tree node missing distance: ${row.slug}`;
  }
  if (expectedDistance != null && row.distance !== expectedDistance) {
    return `containment_tree node distance mismatch: ${row.slug}`;
  }
  if (row.distance === 0 && row.via !== null) {
    return `containment_tree root should not have via: ${row.slug}`;
  }
  if (row.distance > 0 && (typeof row.via !== "string" || row.via.length === 0)) {
    return `containment_tree child missing via: ${row.slug}`;
  }
  if (!row.node || row.node.slug !== row.slug) {
    return `containment_tree node summary mismatch: ${row.slug}`;
  }
  if (!Array.isArray(row.children)) {
    return `containment_tree node missing children: ${row.slug}`;
  }
  if (path.includes(row.slug)) {
    return `containment_tree repeated node in path: ${row.slug}`;
  }
  for (const [childIndex, child] of row.children.entries()) {
    const childFailure = containmentNodeFailure(child, childIndex, {
      expectedDistance: row.distance + 1,
      path: [...path, row.slug],
    });
    if (childFailure) return childFailure;
  }
  return null;
}

function countContainmentNodes(row) {
  return 1 + row.children.reduce((sum, child) => sum + countContainmentNodes(child), 0);
}

function graphEdgeFailure(label, edge, index) {
  if (!edge || typeof edge !== "object" || Array.isArray(edge)) {
    return `${label} malformed edge at index ${index}`;
  }
  for (const key of ["from", "to", "via"]) {
    if (typeof edge[key] !== "string" || edge[key].length === 0) {
      return `${label} missing ${key} at index ${index}`;
    }
  }
  return null;
}

function reachabilityShapeFailure(result) {
  if (result.operation !== "reachability") {
    return `reachability response operation mismatch — ${result.operation}`;
  }
  if (result.start !== "capabilities/mcp-server") {
    return `reachability response start mismatch — ${result.start}`;
  }
  if (!result.node || result.node.slug !== result.start) {
    return "reachability response missing start node";
  }
  if (result.direction !== "outgoing") {
    return `reachability response direction mismatch — ${result.direction}`;
  }
  if (!Number.isInteger(result.depth) || result.depth < 0) {
    return "reachability response missing depth";
  }
  const summaryFailure = numericSummaryFailure("reachability", result.summary, [
    "reachableNodes",
    "traversedEdges",
    "layers",
    "terminalNodes",
  ]);
  if (summaryFailure) return summaryFailure;
  if (!result.byKind || typeof result.byKind !== "object" || Array.isArray(result.byKind)) {
    return "reachability response missing byKind";
  }
  if (!result.byRelation || typeof result.byRelation !== "object" || Array.isArray(result.byRelation)) {
    return "reachability response missing byRelation";
  }
  if (!Array.isArray(result.layers)) {
    return "reachability response missing layers";
  }
  if (result.layers.length !== result.summary.layers) {
    return `reachability layer count mismatch — layers ${result.layers.length}, summary ${result.summary.layers}`;
  }
  for (const [index, layer] of result.layers.entries()) {
    if (!layer || typeof layer !== "object" || Array.isArray(layer)) {
      return `reachability malformed layer at index ${index}`;
    }
    if (!Number.isInteger(layer.distance) || layer.distance <= 0) {
      return `reachability layer missing distance at index ${index}`;
    }
    if (!Number.isInteger(layer.total) || layer.total < 0) {
      return `reachability layer missing total at distance ${layer.distance}`;
    }
    if (!Array.isArray(layer.nodes)) {
      return `reachability layer missing nodes at distance ${layer.distance}`;
    }
    if (layer.nodes.length !== layer.total) {
      return `reachability layer node count mismatch — distance ${layer.distance}`;
    }
    const layerRowsFailure = matchRowsFailure(`reachability layer ${layer.distance}`, layer.nodes);
    if (layerRowsFailure) return layerRowsFailure;
  }
  const pathsFailure = reachablePathsFailure("reachability paths", result.paths, result.summary.reachableNodes);
  if (pathsFailure) return pathsFailure;
  if (!Array.isArray(result.terminalNodes)) {
    return "reachability response missing terminalNodes";
  }
  if (result.terminalNodes.length !== result.summary.terminalNodes) {
    return `reachability terminal count mismatch — terminals ${result.terminalNodes.length}, summary ${result.summary.terminalNodes}`;
  }
  const terminalFailure = matchRowsFailure("reachability terminalNodes", result.terminalNodes);
  if (terminalFailure) return terminalFailure;
  const edgesFailure = graphEdgeBucketFailure("reachability edges", result.edges, result.summary.traversedEdges);
  if (edgesFailure) return edgesFailure;
  return null;
}

function reachablePathsFailure(label, paths, expectedTotal) {
  if (!paths || typeof paths !== "object" || Array.isArray(paths)) {
    return `${label} missing bucket`;
  }
  if (!Number.isInteger(paths.total) || paths.total < 0) {
    return `${label} missing total`;
  }
  if (paths.total !== expectedTotal) {
    return `${label} total mismatch — summary ${expectedTotal}, paths ${paths.total}`;
  }
  if (typeof paths.limited !== "boolean") {
    return `${label} missing limited flag`;
  }
  if (!Array.isArray(paths.rows)) {
    return `${label} missing rows`;
  }
  if (paths.rows.length > paths.total) {
    return `${label} rows exceed total — rows ${paths.rows.length}, total ${paths.total}`;
  }
  if (!paths.limited && paths.rows.length !== paths.total) {
    return `${label} row count mismatch — rows ${paths.rows.length}, total ${paths.total}`;
  }
  for (const [index, row] of paths.rows.entries()) {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      return `${label} malformed row at index ${index}`;
    }
    if (typeof row.slug !== "string" || row.slug.length === 0) {
      return `${label} row missing slug at index ${index}`;
    }
    if (!Number.isInteger(row.distance) || row.distance <= 0) {
      return `${label} row missing distance: ${row.slug}`;
    }
    if (!Array.isArray(row.path) || row.path[0] !== "capabilities/mcp-server" || row.path[row.path.length - 1] !== row.slug) {
      return `${label} row path mismatch: ${row.slug}`;
    }
    if (!Array.isArray(row.edges)) {
      return `${label} row missing edges: ${row.slug}`;
    }
    if (!row.node || row.node.slug !== row.slug) {
      return `${label} row missing node summary: ${row.slug}`;
    }
  }
  return null;
}

function graphEdgeBucketFailure(label, bucket, expectedTotal = null) {
  if (!bucket || typeof bucket !== "object" || Array.isArray(bucket)) {
    return `${label} missing bucket`;
  }
  if (!Number.isInteger(bucket.total) || bucket.total < 0) {
    return `${label} missing total`;
  }
  if (expectedTotal != null && bucket.total !== expectedTotal) {
    return `${label} total mismatch — summary ${expectedTotal}, bucket ${bucket.total}`;
  }
  if (typeof bucket.limited !== "boolean") {
    return `${label} missing limited flag`;
  }
  if (!Array.isArray(bucket.rows)) {
    return `${label} missing rows`;
  }
  if (bucket.rows.length > bucket.total) {
    return `${label} rows exceed total — rows ${bucket.rows.length}, total ${bucket.total}`;
  }
  if (!bucket.limited && bucket.rows.length !== bucket.total) {
    return `${label} row count mismatch — rows ${bucket.rows.length}, total ${bucket.total}`;
  }
  for (const [index, edge] of bucket.rows.entries()) {
    const edgeFailure = graphEdgeFailure(label, edge, index);
    if (edgeFailure) return edgeFailure;
  }
  return null;
}

function impactShapeFailure(result) {
  if (result.operation !== "impact") {
    return `impact response operation mismatch — ${result.operation}`;
  }
  if (result.center !== "capabilities/mcp-server") {
    return `impact response center mismatch — ${result.center}`;
  }
  if (result.direction !== "incoming") {
    return `impact response direction mismatch — ${result.direction}`;
  }
  if (!Number.isInteger(result.depth) || result.depth < 0) {
    return "impact response missing depth";
  }
  if (!Number.isInteger(result.total) || result.total < 0) {
    return "impact response missing total";
  }
  if (typeof result.limited !== "boolean") {
    return "impact response missing limited flag";
  }
  if (!Array.isArray(result.nodes)) {
    return "impact response missing nodes";
  }
  if (result.nodes.length > result.total) {
    return `impact nodes exceed total — nodes ${result.nodes.length}, total ${result.total}`;
  }
  if (!result.limited && result.nodes.length !== result.total) {
    return `impact node count mismatch — nodes ${result.nodes.length}, total ${result.total}`;
  }
  for (const [index, row] of result.nodes.entries()) {
    const rowFailure = impactedNodeFailure("impact", row, index);
    if (rowFailure) return rowFailure;
  }
  if (!Array.isArray(result.edges)) {
    return "impact response missing edges";
  }
  for (const [index, edge] of result.edges.entries()) {
    const edgeFailure = graphEdgeFailure("impact edge", edge, index);
    if (edgeFailure) return edgeFailure;
  }
  return null;
}

function impactedNodeFailure(label, row, index) {
  if (!row || typeof row !== "object" || Array.isArray(row)) {
    return `${label} malformed node at index ${index}`;
  }
  if (typeof row.slug !== "string" || row.slug.length === 0) {
    return `${label} node missing slug at index ${index}`;
  }
  if (!Number.isInteger(row.distance) || row.distance <= 0) {
    return `${label} node missing distance: ${row.slug}`;
  }
  if (!row.node || row.node.slug !== row.slug) {
    return `${label} node summary mismatch: ${row.slug}`;
  }
  return null;
}

function blastRadiusShapeFailure(result) {
  if (result.operation !== "blast_radius") {
    return `blast_radius response operation mismatch — ${result.operation}`;
  }
  if (result.center !== "capabilities/mcp-server") {
    return `blast_radius response center mismatch — ${result.center}`;
  }
  if (!result.node || result.node.slug !== result.center) {
    return "blast_radius response missing center node";
  }
  if (result.direction !== "incoming") {
    return `blast_radius response direction mismatch — ${result.direction}`;
  }
  if (!Number.isInteger(result.depth) || result.depth < 0) {
    return "blast_radius response missing depth";
  }
  if (!["low", "medium", "high"].includes(result.risk)) {
    return `blast_radius response unknown risk — ${result.risk}`;
  }
  const summaryFailure = numericSummaryFailure("blast_radius", result.summary, [
    "affectedNodes",
    "affectedEdges",
    "affectedKinds",
    "affectedDomains",
    "crossDomainEdges",
  ]);
  if (summaryFailure) return summaryFailure;
  if (!result.byKind || typeof result.byKind !== "object" || Array.isArray(result.byKind)) {
    return "blast_radius response missing byKind";
  }
  if (!result.byDomain || typeof result.byDomain !== "object" || Array.isArray(result.byDomain)) {
    return "blast_radius response missing byDomain";
  }
  const nodesFailure = blastRadiusNodeBucketFailure(result.nodes, result.summary.affectedNodes);
  if (nodesFailure) return nodesFailure;
  const edgesFailure = blastRadiusEdgeBucketFailure(result.edges, result.summary.affectedEdges);
  if (edgesFailure) return edgesFailure;
  const crossDomainRows = result.edges.rows.filter((edge) => edge.crossDomain).length;
  if (crossDomainRows > result.summary.crossDomainEdges) {
    return `blast_radius cross-domain edge mismatch — rows ${crossDomainRows}, summary ${result.summary.crossDomainEdges}`;
  }
  return null;
}

function blastRadiusNodeBucketFailure(bucket, expectedTotal) {
  if (!bucket || typeof bucket !== "object" || Array.isArray(bucket)) {
    return "blast_radius nodes missing bucket";
  }
  if (!Number.isInteger(bucket.total) || bucket.total < 0) {
    return "blast_radius nodes missing total";
  }
  if (bucket.total !== expectedTotal) {
    return `blast_radius nodes total mismatch — summary ${expectedTotal}, bucket ${bucket.total}`;
  }
  if (typeof bucket.limited !== "boolean") {
    return "blast_radius nodes missing limited flag";
  }
  if (!Array.isArray(bucket.rows)) {
    return "blast_radius nodes missing rows";
  }
  if (bucket.rows.length > bucket.total) {
    return `blast_radius nodes rows exceed total — rows ${bucket.rows.length}, total ${bucket.total}`;
  }
  if (!bucket.limited && bucket.rows.length !== bucket.total) {
    return `blast_radius nodes row count mismatch — rows ${bucket.rows.length}, total ${bucket.total}`;
  }
  for (const [index, row] of bucket.rows.entries()) {
    const rowFailure = impactedNodeFailure("blast_radius", row, index);
    if (rowFailure) return rowFailure;
    if (row.domain !== null && typeof row.domain !== "string") {
      return `blast_radius node missing domain: ${row.slug}`;
    }
  }
  return null;
}

function blastRadiusEdgeBucketFailure(bucket, expectedTotal) {
  const bucketFailure = graphEdgeBucketFailure("blast_radius edges", bucket, expectedTotal);
  if (bucketFailure) return bucketFailure;
  for (const [index, edge] of bucket.rows.entries()) {
    if (edge.fromDomain !== null && typeof edge.fromDomain !== "string") {
      return `blast_radius edge missing fromDomain at index ${index}`;
    }
    if (edge.toDomain !== null && typeof edge.toDomain !== "string") {
      return `blast_radius edge missing toDomain at index ${index}`;
    }
    if (typeof edge.crossDomain !== "boolean") {
      return `blast_radius edge missing crossDomain at index ${index}`;
    }
  }
  return null;
}

function subgraphShapeFailure(result) {
  if (result.operation !== "subgraph") {
    return `subgraph response operation mismatch — ${result.operation}`;
  }
  if (result.seed !== "capabilities/mcp-server") {
    return `subgraph response seed mismatch — ${result.seed}`;
  }
  if (result.direction !== "both") {
    return `subgraph response direction mismatch — ${result.direction}`;
  }
  for (const key of ["depth", "totalNodes", "totalEdges"]) {
    if (!Number.isInteger(result[key]) || result[key] < 0) {
      return `subgraph response missing ${key}`;
    }
  }
  if (typeof result.limited !== "boolean") {
    return "subgraph response missing limited flag";
  }
  if (!Array.isArray(result.nodes)) {
    return "subgraph response missing nodes";
  }
  if (result.nodes.length > result.totalNodes) {
    return `subgraph nodes exceed total — nodes ${result.nodes.length}, total ${result.totalNodes}`;
  }
  if (!result.limited && result.nodes.length !== result.totalNodes) {
    return `subgraph node count mismatch — nodes ${result.nodes.length}, total ${result.totalNodes}`;
  }
  if (!result.nodes.some((row) => row.slug === result.seed && row.distance === 0)) {
    return "subgraph response missing seed node";
  }
  for (const [index, row] of result.nodes.entries()) {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      return `subgraph malformed node at index ${index}`;
    }
    if (typeof row.slug !== "string" || row.slug.length === 0) {
      return `subgraph node missing slug at index ${index}`;
    }
    if (!Number.isInteger(row.distance) || row.distance < 0) {
      return `subgraph node missing distance: ${row.slug}`;
    }
    if (!row.node || row.node.slug !== row.slug) {
      return `subgraph node summary mismatch: ${row.slug}`;
    }
  }
  if (!Array.isArray(result.edges)) {
    return "subgraph response missing edges";
  }
  if (result.edges.length !== result.totalEdges) {
    return `subgraph edge count mismatch — edges ${result.edges.length}, total ${result.totalEdges}`;
  }
  for (const [index, edge] of result.edges.entries()) {
    const edgeFailure = graphEdgeFailure("subgraph edge", edge, index);
    if (edgeFailure) return edgeFailure;
  }
  return null;
}

function schemaShapeFailure(result) {
  if (result.operation !== "schema") {
    return `schema response operation mismatch — ${result.operation}`;
  }
  if (!Number.isInteger(result.totalPatterns) || result.totalPatterns < 0) {
    return "schema response missing totalPatterns";
  }
  if (typeof result.limited !== "boolean") {
    return "schema response missing limited flag";
  }
  if (!Array.isArray(result.patterns)) {
    return "schema response missing patterns";
  }
  if (result.patterns.length > result.totalPatterns) {
    return `schema patterns exceed total — patterns ${result.patterns.length}, total ${result.totalPatterns}`;
  }
  if (!result.limited && result.patterns.length !== result.totalPatterns) {
    return `schema pattern count mismatch — patterns ${result.patterns.length}, total ${result.totalPatterns}`;
  }
  if (result.patterns.length === 0) {
    return "schema response returned no patterns";
  }
  for (const [index, pattern] of result.patterns.entries()) {
    const patternFailure = schemaPatternFailure("schema", pattern, index);
    if (patternFailure) return patternFailure;
  }
  return null;
}

function schemaPatternFailure(label, pattern, index) {
  if (!pattern || typeof pattern !== "object" || Array.isArray(pattern)) {
    return `${label} malformed pattern at index ${index}`;
  }
  for (const key of ["fromKind", "relation", "toKind"]) {
    if (typeof pattern[key] !== "string" || pattern[key].length === 0) {
      return `${label} pattern missing ${key} at index ${index}`;
    }
  }
  for (const key of ["count", "resolved", "external"]) {
    if (!Number.isInteger(pattern[key]) || pattern[key] < 0) {
      return `${label} pattern missing ${key}: ${pattern.fromKind}-${pattern.relation}-${pattern.toKind}`;
    }
  }
  if (pattern.resolved + pattern.external > pattern.count) {
    return `${label} pattern resolution exceeds count: ${pattern.fromKind}-${pattern.relation}-${pattern.toKind}`;
  }
  return null;
}

function facetsShapeFailure(result) {
  if (result.operation !== "facets") {
    return `facets response operation mismatch — ${result.operation}`;
  }
  const graphFailure = numericSummaryFailure("facets graph", result.graph, [
    "nodes",
    "edges",
    "resolvedEdges",
    "externalEdges",
    "unresolvedEdges",
  ]);
  if (graphFailure) return graphFailure;
  if (result.graph.edges !== result.graph.resolvedEdges + result.graph.externalEdges + result.graph.unresolvedEdges) {
    return `facets graph edge count mismatch — edges ${result.graph.edges}, parts ${result.graph.resolvedEdges + result.graph.externalEdges + result.graph.unresolvedEdges}`;
  }
  if (!result.nodes || typeof result.nodes !== "object" || Array.isArray(result.nodes)) {
    return "facets response missing nodes block";
  }
  for (const key of ["byKind", "byDomain", "byDegreeBucket"]) {
    if (!result.nodes[key] || typeof result.nodes[key] !== "object" || Array.isArray(result.nodes[key])) {
      return `facets nodes missing ${key}`;
    }
  }
  if (!Array.isArray(result.nodes.topByDegree)) {
    return "facets nodes missing topByDegree";
  }
  const topFailure = matchRowsFailure("facets topByDegree", result.nodes.topByDegree);
  if (topFailure) return topFailure;
  if (!result.edges || typeof result.edges !== "object" || Array.isArray(result.edges)) {
    return "facets response missing edges block";
  }
  if (!result.edges.byRelation || typeof result.edges.byRelation !== "object" || Array.isArray(result.edges.byRelation)) {
    return "facets edges missing byRelation";
  }
  const resolutionFailure = numericSummaryFailure("facets edges.byResolution", result.edges.byResolution, [
    "resolved",
    "external",
    "unresolved",
  ]);
  if (resolutionFailure) return resolutionFailure;
  if (result.edges.byResolution.resolved !== result.graph.resolvedEdges || result.edges.byResolution.external !== result.graph.externalEdges || result.edges.byResolution.unresolved !== result.graph.unresolvedEdges) {
    return "facets edge resolution mismatch with graph summary";
  }
  if (!Array.isArray(result.edges.topPatterns)) {
    return "facets edges missing topPatterns";
  }
  for (const [index, pattern] of result.edges.topPatterns.entries()) {
    const patternFailure = schemaPatternFailure("facets topPatterns", pattern, index);
    if (patternFailure) return patternFailure;
  }
  return null;
}

function matchNodesShapeFailure(result) {
  if (result.operation !== "match_nodes") {
    return `match_nodes response operation mismatch — ${result.operation}`;
  }
  if (!result.filters || typeof result.filters !== "object" || Array.isArray(result.filters)) {
    return "match_nodes response missing filters";
  }
  if (result.filters.kind !== "capability") {
    return `match_nodes filter kind mismatch — ${result.filters.kind}`;
  }
  if (result.filters.slugContains !== "mcp") {
    return `match_nodes filter slugContains mismatch — ${result.filters.slugContains}`;
  }
  if (result.filters.sort !== "degree") {
    return `match_nodes filter sort mismatch — ${result.filters.sort}`;
  }
  if (!Number.isInteger(result.totalMatches) || result.totalMatches < 0) {
    return "match_nodes response missing totalMatches";
  }
  if (typeof result.limited !== "boolean") {
    return "match_nodes response missing limited flag";
  }
  if (!Array.isArray(result.nodes)) {
    return "match_nodes response missing nodes";
  }
  if (result.nodes.length > result.totalMatches) {
    return `match_nodes rows exceed total — rows ${result.nodes.length}, total ${result.totalMatches}`;
  }
  if (!result.limited && result.nodes.length !== result.totalMatches) {
    return `match_nodes row count mismatch — rows ${result.nodes.length}, total ${result.totalMatches}`;
  }
  if (result.nodes.length === 0) {
    return "match_nodes response returned no nodes";
  }
  for (const [index, node] of result.nodes.entries()) {
    const rowFailure = matchRowsFailure("match_nodes", [node]);
    if (rowFailure) return rowFailure.replace("at index 0", `at index ${index}`);
    if (!Number.isInteger(node.inDegree) || node.inDegree < 0) {
      return `match_nodes row missing inDegree: ${node.slug}`;
    }
    if (!Number.isInteger(node.outDegree) || node.outDegree < 0) {
      return `match_nodes row missing outDegree: ${node.slug}`;
    }
    if (!Number.isInteger(node.degree) || node.degree < 0) {
      return `match_nodes row missing degree: ${node.slug}`;
    }
    if (node.degree !== node.inDegree + node.outDegree) {
      return `match_nodes row degree mismatch: ${node.slug}`;
    }
    if (node.kind !== "capability") {
      return `match_nodes row kind mismatch: ${node.slug}`;
    }
    if (!node.slug.toLowerCase().includes("mcp")) {
      return `match_nodes row slug filter mismatch: ${node.slug}`;
    }
  }
  return null;
}

function matchEdgesShapeFailure(result) {
  if (result.operation !== "match_edges") {
    return `match_edges response operation mismatch — ${result.operation}`;
  }
  if (!result.filters || typeof result.filters !== "object" || Array.isArray(result.filters)) {
    return "match_edges response missing filters";
  }
  if (result.filters.from !== "capabilities/mcp-server") {
    return `match_edges filter from mismatch — ${result.filters.from}`;
  }
  if (result.filters.includeExternal !== true) {
    return "match_edges filter includeExternal mismatch";
  }
  if (!Number.isInteger(result.totalMatches) || result.totalMatches < 0) {
    return "match_edges response missing totalMatches";
  }
  if (typeof result.limited !== "boolean") {
    return "match_edges response missing limited flag";
  }
  if (!Array.isArray(result.edges)) {
    return "match_edges response missing edges";
  }
  if (result.edges.length > result.totalMatches) {
    return `match_edges rows exceed total — rows ${result.edges.length}, total ${result.totalMatches}`;
  }
  if (!result.limited && result.edges.length !== result.totalMatches) {
    return `match_edges row count mismatch — rows ${result.edges.length}, total ${result.totalMatches}`;
  }
  if (result.edges.length === 0) {
    return "match_edges response returned no edges";
  }
  for (const [index, edge] of result.edges.entries()) {
    const edgeFailure = graphEdgeFailure("match_edges edge", edge, index);
    if (edgeFailure) return edgeFailure;
    if (edge.from !== "capabilities/mcp-server") {
      return `match_edges row from mismatch at index ${index}`;
    }
    if (!edge.fromNode || edge.fromNode.slug !== edge.from) {
      return `match_edges row missing fromNode at index ${index}`;
    }
    if (typeof edge.toKind !== "string" || edge.toKind.length === 0) {
      return `match_edges row missing toKind at index ${index}`;
    }
    if (edge.resolved && (!edge.toNode || edge.toNode.slug !== edge.to)) {
      return `match_edges row missing toNode at index ${index}`;
    }
    if (edge.resolved && edge.toNode.kind !== edge.toKind) {
      return `match_edges row toKind mismatch at index ${index}`;
    }
    if (edge.external && edge.toNode !== null) {
      return `match_edges external row has toNode at index ${index}`;
    }
    if (edge.external && edge.toKind !== "external") {
      return `match_edges external row toKind mismatch at index ${index}`;
    }
  }
  return null;
}

function nodeProfileShapeFailure(result) {
  if (result.operation !== "node_profile") {
    return `node_profile response operation mismatch — ${result.operation}`;
  }
  if (result.center !== "capabilities/mcp-server") {
    return `node_profile response center mismatch — ${result.center}`;
  }
  if (!result.node || result.node.slug !== result.center) {
    return "node_profile response missing center node";
  }
  const degreeFailure = numericSummaryFailure("node_profile degree", result.degree, ["in", "out", "total"]);
  if (degreeFailure) return degreeFailure;
  if (result.degree.total !== result.degree.in + result.degree.out) {
    return `node_profile degree mismatch — total ${result.degree.total}, in+out ${result.degree.in + result.degree.out}`;
  }
  if (!Array.isArray(result.aliases)) {
    return "node_profile response missing aliases";
  }
  if (!result.edges || typeof result.edges !== "object" || Array.isArray(result.edges)) {
    return "node_profile response missing edges";
  }
  for (const key of ["incoming", "outgoing"]) {
    const edgeGroupFailure = profileEdgeGroupFailure(`node_profile ${key}`, result.edges[key], {
      center: result.center,
      direction: key,
    });
    if (edgeGroupFailure) return edgeGroupFailure;
  }
  if (!result.containment || typeof result.containment !== "object" || Array.isArray(result.containment)) {
    return "node_profile response missing containment";
  }
  for (const key of ["parents", "children"]) {
    if (!Array.isArray(result.containment[key])) {
      return `node_profile containment missing ${key}`;
    }
    for (const [index, row] of result.containment[key].entries()) {
      const rowFailure = containmentSummaryRowFailure(`node_profile containment ${key}`, row, index);
      if (rowFailure) return rowFailure;
    }
  }
  if (typeof result.containment.parentLimited !== "boolean" || typeof result.containment.childLimited !== "boolean") {
    return "node_profile containment missing limited flags";
  }
  if (!result.lineage || typeof result.lineage !== "object" || Array.isArray(result.lineage)) {
    return "node_profile response missing lineage";
  }
  if (!Number.isInteger(result.lineage.depth) || result.lineage.depth < 0) {
    return "node_profile lineage missing depth";
  }
  for (const key of ["ancestors", "descendants"]) {
    const bucketFailure = lineageBucketFailure(`node_profile lineage ${key}`, result.lineage[key]);
    if (bucketFailure) return bucketFailure;
  }
  return null;
}

function centralityShapeFailure(result) {
  if (result.operation !== "centrality") {
    return `centrality response operation mismatch — ${result.operation}`;
  }
  const graphFailure = numericSummaryFailure("centrality graph", result.graph, ["nodes", "edges", "resolvedEdges"]);
  if (graphFailure) return graphFailure;
  if (typeof result.graph.graphHash !== "string" || result.graph.graphHash.length === 0) {
    return "centrality graph missing graphHash";
  }
  if (!result.parameters || typeof result.parameters !== "object" || Array.isArray(result.parameters)) {
    return "centrality response missing parameters";
  }
  if (result.parameters.types !== null && !Array.isArray(result.parameters.types)) {
    return "centrality parameters missing types";
  }
  for (const key of ["iterations", "limit"]) {
    if (!Number.isInteger(result.parameters[key]) || result.parameters[key] <= 0) {
      return `centrality parameters missing ${key}`;
    }
  }
  if (!result.rankings || typeof result.rankings !== "object" || Array.isArray(result.rankings)) {
    return "centrality response missing rankings";
  }
  for (const key of ["pageRank", "bridges", "authorities", "hubs"]) {
    const rows = result.rankings[key];
    if (!Array.isArray(rows)) {
      return `centrality rankings missing ${key}`;
    }
    if (rows.length > result.parameters.limit) {
      return `centrality ${key} rows exceed limit — rows ${rows.length}, limit ${result.parameters.limit}`;
    }
    if (key === "pageRank" && rows.length === 0) {
      return "centrality pageRank returned no rows";
    }
    for (const [index, row] of rows.entries()) {
      const rowFailure = centralityRowFailure(`centrality ${key}`, row, index);
      if (rowFailure) return rowFailure;
    }
  }
  return null;
}

function centralityRowFailure(label, row, index) {
  const summaryFailure = matchRowsFailure(label, [row]);
  if (summaryFailure) return summaryFailure.replace("at index 0", `at index ${index}`);
  for (const key of ["inDegree", "outDegree", "degree", "bridgeScore"]) {
    if (!Number.isInteger(row[key]) || row[key] < 0) {
      return `${label} row missing ${key}: ${row.slug}`;
    }
  }
  if (row.degree !== row.inDegree + row.outDegree) {
    return `${label} degree mismatch: ${row.slug}`;
  }
  if (typeof row.pageRank !== "number" || !Number.isFinite(row.pageRank) || row.pageRank < 0) {
    return `${label} row missing pageRank: ${row.slug}`;
  }
  return null;
}

function communitiesShapeFailure(result) {
  if (result.operation !== "communities") {
    return `communities response operation mismatch — ${result.operation}`;
  }
  if (!result.parameters || typeof result.parameters !== "object" || Array.isArray(result.parameters)) {
    return "communities response missing parameters";
  }
  if (result.parameters.types !== null && !Array.isArray(result.parameters.types)) {
    return "communities parameters missing types";
  }
  for (const key of ["iterations", "limit", "nodeLimit"]) {
    if (!Number.isInteger(result.parameters[key]) || result.parameters[key] <= 0) {
      return `communities parameters missing ${key}`;
    }
  }
  const summaryFailure = numericSummaryFailure("communities", result.summary, [
    "communities",
    "largestSize",
    "singletonCount",
    "crossCommunityEdges",
  ]);
  if (summaryFailure) return summaryFailure;
  if (typeof result.limited !== "boolean") {
    return "communities response missing limited flag";
  }
  if (!Array.isArray(result.communities)) {
    return "communities response missing communities";
  }
  if (result.communities.length === 0) {
    return "communities response returned no communities";
  }
  if (result.communities.length > result.summary.communities) {
    return `communities rows exceed total — rows ${result.communities.length}, total ${result.summary.communities}`;
  }
  if (!result.limited && result.communities.length !== result.summary.communities) {
    return `communities row count mismatch — rows ${result.communities.length}, total ${result.summary.communities}`;
  }
  const largestObserved = result.communities.reduce((max, community) => Math.max(max, Number.isInteger(community?.size) ? community.size : 0), 0);
  if (result.summary.largestSize < largestObserved) {
    return `communities largestSize below returned community — largest ${result.summary.largestSize}, observed ${largestObserved}`;
  }
  for (const [index, community] of result.communities.entries()) {
    const communityFailure = communityRowFailure(community, index, result.parameters.nodeLimit);
    if (communityFailure) return communityFailure;
  }
  const crossFailure = communityEdgeBucketFailure("communities crossCommunityEdges", result.crossCommunityEdges, result.summary.crossCommunityEdges);
  if (crossFailure) return crossFailure;
  return null;
}

function communityRowFailure(community, index, nodeLimit) {
  if (!community || typeof community !== "object" || Array.isArray(community)) {
    return `communities malformed community at index ${index}`;
  }
  if (!Number.isInteger(community.id) || community.id <= 0) {
    return `communities community missing id at index ${index}`;
  }
  if (typeof community.label !== "string" || community.label.length === 0) {
    return `communities community missing label: ${community.id}`;
  }
  for (const key of ["size", "internalEdges", "boundaryEdges"]) {
    const min = key === "size" ? 1 : 0;
    if (!Number.isInteger(community[key]) || community[key] < min) {
      return `communities community missing ${key}: ${community.id}`;
    }
  }
  for (const key of ["kinds", "domains"]) {
    if (!community[key] || typeof community[key] !== "object" || Array.isArray(community[key])) {
      return `communities community missing ${key}: ${community.id}`;
    }
  }
  const kindTotal = Object.values(community.kinds).reduce((sum, count) => sum + (Number.isInteger(count) ? count : 0), 0);
  if (kindTotal !== community.size) {
    return `communities community kind count mismatch: ${community.id}`;
  }
  const representativeFailure = matchRowsFailure("communities representative", [community.representative]);
  if (representativeFailure) return representativeFailure.replace("at index 0", `for community ${community.id}`);
  if (typeof community.nodeLimited !== "boolean") {
    return `communities community missing nodeLimited flag: ${community.id}`;
  }
  if (!Array.isArray(community.nodes)) {
    return `communities community missing nodes: ${community.id}`;
  }
  if (community.nodes.length > community.size) {
    return `communities community nodes exceed size: ${community.id}`;
  }
  if (community.nodes.length > nodeLimit) {
    return `communities community nodes exceed nodeLimit: ${community.id}`;
  }
  if (!community.nodeLimited && community.nodes.length !== community.size) {
    return `communities community node count mismatch: ${community.id}`;
  }
  return matchRowsFailure(`communities community ${community.id}`, community.nodes);
}

function communityEdgeBucketFailure(label, bucket, expectedTotal) {
  if (!bucket || typeof bucket !== "object" || Array.isArray(bucket)) {
    return `${label} missing bucket`;
  }
  if (!Number.isInteger(bucket.total) || bucket.total < 0) {
    return `${label} missing total`;
  }
  if (bucket.total !== expectedTotal) {
    return `${label} total mismatch — summary ${expectedTotal}, bucket ${bucket.total}`;
  }
  if (typeof bucket.limited !== "boolean") {
    return `${label} missing limited flag`;
  }
  if (!Array.isArray(bucket.rows)) {
    return `${label} missing rows`;
  }
  if (bucket.rows.length > bucket.total) {
    return `${label} rows exceed total — rows ${bucket.rows.length}, total ${bucket.total}`;
  }
  if (!bucket.limited && bucket.rows.length !== bucket.total) {
    return `${label} row count mismatch — rows ${bucket.rows.length}, total ${bucket.total}`;
  }
  for (const [index, edge] of bucket.rows.entries()) {
    const edgeFailure = graphEdgeFailure(label, edge, index);
    if (edgeFailure) return edgeFailure;
    for (const key of ["fromCommunity", "toCommunity"]) {
      if (!Number.isInteger(edge[key]) || edge[key] <= 0) {
        return `${label} missing ${key} at index ${index}`;
      }
    }
  }
  return null;
}

function similarNodesShapeFailure(result) {
  if (result.operation !== "similar_nodes") {
    return `similar_nodes response operation mismatch — ${result.operation}`;
  }
  if (!result.source || typeof result.source !== "object" || Array.isArray(result.source)) {
    return "similar_nodes response missing source";
  }
  const expectedSource = {
    mode: "candidate",
    slug: "capabilities/mcp-server-v2",
    kind: "capability",
    title: "MCP Server",
    domain: "domains/ai-agent-partner",
  };
  for (const [key, value] of Object.entries(expectedSource)) {
    if (result.source[key] !== value) {
      return `similar_nodes source ${key} mismatch — ${result.source[key]}`;
    }
  }
  if (!result.parameters || typeof result.parameters !== "object" || Array.isArray(result.parameters)) {
    return "similar_nodes response missing parameters";
  }
  if (result.parameters.types !== null && !Array.isArray(result.parameters.types)) {
    return "similar_nodes parameters missing types";
  }
  if (!Number.isInteger(result.parameters.limit) || result.parameters.limit <= 0) {
    return "similar_nodes parameters missing limit";
  }
  if (!Number.isInteger(result.totalMatches) || result.totalMatches < 0) {
    return "similar_nodes response missing totalMatches";
  }
  if (typeof result.limited !== "boolean") {
    return "similar_nodes response missing limited flag";
  }
  if (!Array.isArray(result.matches)) {
    return "similar_nodes response missing matches";
  }
  if (result.matches.length === 0) {
    return "similar_nodes response returned no matches";
  }
  if (result.matches.length > result.totalMatches) {
    return `similar_nodes rows exceed total — rows ${result.matches.length}, total ${result.totalMatches}`;
  }
  if (!result.limited && result.matches.length !== result.totalMatches) {
    return `similar_nodes row count mismatch — rows ${result.matches.length}, total ${result.totalMatches}`;
  }
  if (!result.matches.some((match) => match?.node?.slug === "capabilities/mcp-server")) {
    return "similar_nodes response missing existing mcp-server match";
  }
  for (const [index, match] of result.matches.entries()) {
    const matchFailure = similarMatchFailure(match, index);
    if (matchFailure) return matchFailure;
  }
  return null;
}

function similarMatchFailure(match, index) {
  if (!match || typeof match !== "object" || Array.isArray(match)) {
    return `similar_nodes malformed match at index ${index}`;
  }
  const nodeFailure = matchRowsFailure("similar_nodes match node", [match.node]);
  if (nodeFailure) return nodeFailure.replace("at index 0", `at index ${index}`);
  if (typeof match.score !== "number" || !Number.isFinite(match.score) || match.score < 0) {
    return `similar_nodes match missing score: ${match.node.slug}`;
  }
  if (!match.signals || typeof match.signals !== "object" || Array.isArray(match.signals)) {
    return `similar_nodes match missing signals: ${match.node.slug}`;
  }
  for (const key of ["slug", "title", "kind", "domain", "neighbors"]) {
    if (typeof match.signals[key] !== "number" || !Number.isFinite(match.signals[key]) || match.signals[key] < 0) {
      return `similar_nodes match missing signal ${key}: ${match.node.slug}`;
    }
  }
  const signalTotal = Object.values(match.signals).reduce((sum, value) => sum + value, 0);
  if (Math.abs(match.score - signalTotal) > 0.00001) {
    return `similar_nodes match score mismatch: ${match.node.slug}`;
  }
  if (!Array.isArray(match.sharedNeighbors)) {
    return `similar_nodes match missing sharedNeighbors: ${match.node.slug}`;
  }
  return matchRowsFailure(`similar_nodes sharedNeighbors ${match.node.slug}`, match.sharedNeighbors);
}

function explainRelationShapeFailure(result) {
  if (result.operation !== "explain_relation") {
    return `explain_relation response operation mismatch — ${result.operation}`;
  }
  if (result.from !== "capabilities/mcp-server") {
    return `explain_relation from mismatch — ${result.from}`;
  }
  if (result.to !== "domains/vault-local-first") {
    return `explain_relation to mismatch — ${result.to}`;
  }
  if (!result.fromNode || result.fromNode.slug !== result.from) {
    return "explain_relation response missing fromNode";
  }
  if (!result.toNode || result.toNode.slug !== result.to) {
    return "explain_relation response missing toNode";
  }
  if (typeof result.verdict !== "string" || result.verdict.length === 0) {
    return "explain_relation response missing verdict";
  }
  if (!result.domains || typeof result.domains !== "object" || Array.isArray(result.domains)) {
    return "explain_relation response missing domains";
  }
  for (const key of ["from", "to"]) {
    if (result.domains[key] !== null && typeof result.domains[key] !== "string") {
      return `explain_relation domains missing ${key}`;
    }
  }
  if (typeof result.domains.sameDomain !== "boolean") {
    return "explain_relation domains missing sameDomain";
  }
  const directFailure = relationEdgeBucketFailure("explain_relation direct", result.direct);
  if (directFailure) return directFailure;
  const pathFailure = shortestRelationPathFailure(result.shortestPath, result.from, result.to);
  if (pathFailure) return pathFailure;
  const commonFailure = commonNeighborBucketFailure("explain_relation commonNeighbors", result.commonNeighbors, {
    from: result.from,
    to: result.to,
  });
  if (commonFailure) return commonFailure;
  return null;
}

function shortestRelationPathFailure(path, from, to) {
  if (!path || typeof path !== "object" || Array.isArray(path)) {
    return "explain_relation response missing shortestPath";
  }
  if (typeof path.found !== "boolean") {
    return "explain_relation shortestPath missing found flag";
  }
  if (!path.found) {
    return "explain_relation expected shortestPath to be found";
  }
  if (typeof path.direction !== "string" || path.direction.length === 0) {
    return "explain_relation shortestPath missing direction";
  }
  if (!Number.isInteger(path.maxHops) || path.maxHops <= 0) {
    return "explain_relation shortestPath missing maxHops";
  }
  if (!Number.isInteger(path.hopCount) || path.hopCount < 0) {
    return "explain_relation shortestPath missing hopCount";
  }
  if (!Array.isArray(path.hops) || path.hops.length === 0) {
    return "explain_relation shortestPath missing hops";
  }
  if (path.hops[0] !== from || path.hops[path.hops.length - 1] !== to) {
    return "explain_relation shortestPath endpoint mismatch";
  }
  if (path.hopCount !== path.hops.length - 1) {
    return `explain_relation shortestPath hop mismatch — hopCount ${path.hopCount}, hops ${path.hops.length}`;
  }
  if (!Array.isArray(path.edges)) {
    return "explain_relation shortestPath missing edges";
  }
  if (path.edges.length !== path.hopCount) {
    return `explain_relation shortestPath edge mismatch — edges ${path.edges.length}, hopCount ${path.hopCount}`;
  }
  for (const [index, edge] of path.edges.entries()) {
    const edgeFailure = graphEdgeFailure("explain_relation shortestPath", edge, index);
    if (edgeFailure) return edgeFailure;
    const left = path.hops[index];
    const right = path.hops[index + 1];
    const connectsForward = edge.from === left && edge.to === right;
    const connectsBackward = edge.from === right && edge.to === left;
    if (!connectsForward && !connectsBackward) {
      return `explain_relation shortestPath edge endpoint mismatch at index ${index}`;
    }
  }
  return null;
}

function relationEdgeBucketFailure(label, bucket) {
  if (!bucket || typeof bucket !== "object" || Array.isArray(bucket)) {
    return `${label} missing bucket`;
  }
  if (!Number.isInteger(bucket.total) || bucket.total < 0) {
    return `${label} missing total`;
  }
  if (!Array.isArray(bucket.edges)) {
    return `${label} missing edges`;
  }
  if (bucket.edges.length > bucket.total) {
    return `${label} edges exceed total — edges ${bucket.edges.length}, total ${bucket.total}`;
  }
  for (const [index, edge] of bucket.edges.entries()) {
    const edgeFailure = graphEdgeFailure(label, edge, index);
    if (edgeFailure) return edgeFailure;
  }
  return null;
}

function commonNeighborBucketFailure(label, bucket, options = {}) {
  if (!bucket || typeof bucket !== "object" || Array.isArray(bucket)) {
    return `${label} missing bucket`;
  }
  if (!Number.isInteger(bucket.total) || bucket.total < 0) {
    return `${label} missing total`;
  }
  if (typeof bucket.limited !== "boolean") {
    return `${label} missing limited flag`;
  }
  if (!Array.isArray(bucket.rows)) {
    return `${label} missing rows`;
  }
  if (bucket.rows.length > bucket.total) {
    return `${label} rows exceed total — rows ${bucket.rows.length}, total ${bucket.total}`;
  }
  if (!bucket.limited && bucket.rows.length !== bucket.total) {
    return `${label} row count mismatch — rows ${bucket.rows.length}, total ${bucket.total}`;
  }
  for (const [index, row] of bucket.rows.entries()) {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      return `${label} malformed row at index ${index}`;
    }
    if (typeof row.slug !== "string" || row.slug.length === 0) {
      return `${label} row missing slug at index ${index}`;
    }
    if (!row.node || row.node.slug !== row.slug) {
      return `${label} row missing node summary: ${row.slug}`;
    }
    for (const key of ["fromEdges", "toEdges"]) {
      if (!Array.isArray(row[key])) {
        return `${label} row missing ${key}: ${row.slug}`;
      }
      for (const [edgeIndex, edge] of row[key].entries()) {
        const edgeFailure = graphEdgeFailure(`${label} ${key}`, edge, edgeIndex);
        if (edgeFailure) return edgeFailure;
        if (!["incoming", "outgoing"].includes(edge.direction)) {
          return `${label} ${key} missing direction at index ${edgeIndex}`;
        }
        const endpoint = key === "fromEdges" ? options.from : options.to;
        if (endpoint) {
          const connectsForward = edge.from === endpoint && edge.to === row.slug;
          const connectsBackward = edge.from === row.slug && edge.to === endpoint;
          if (!connectsForward && !connectsBackward) {
            return `${label} ${key} endpoint mismatch at index ${edgeIndex}`;
          }
        }
      }
    }
  }
  return null;
}

function profileEdgeGroupFailure(label, group, options = {}) {
  if (!group || typeof group !== "object" || Array.isArray(group)) {
    return `${label} missing group`;
  }
  if (!Number.isInteger(group.total) || group.total < 0) {
    return `${label} missing total`;
  }
  if (typeof group.limited !== "boolean") {
    return `${label} missing limited flag`;
  }
  if (!group.byRelation || typeof group.byRelation !== "object" || Array.isArray(group.byRelation)) {
    return `${label} missing byRelation`;
  }
  if (!Array.isArray(group.edges)) {
    return `${label} missing edges`;
  }
  if (group.edges.length > group.total) {
    return `${label} edges exceed total — edges ${group.edges.length}, total ${group.total}`;
  }
  if (!group.limited && group.edges.length !== group.total) {
    return `${label} edge count mismatch — edges ${group.edges.length}, total ${group.total}`;
  }
  for (const [index, edge] of group.edges.entries()) {
    const edgeFailure = graphEdgeFailure(label, edge, index);
    if (edgeFailure) return edgeFailure;
    if (options.center && options.direction === "incoming" && edge.to !== options.center) {
      return `${label} edge target mismatch at index ${index}`;
    }
    if (options.center && options.direction === "outgoing" && edge.from !== options.center) {
      return `${label} edge source mismatch at index ${index}`;
    }
    if (typeof edge.otherKind !== "string" || edge.otherKind.length === 0) {
      return `${label} edge missing otherKind at index ${index}`;
    }
    if (edge.resolved && (!edge.otherNode || typeof edge.otherNode.slug !== "string")) {
      return `${label} edge missing otherNode at index ${index}`;
    }
    if (edge.resolved && edge.otherNode.kind !== edge.otherKind) {
      return `${label} edge otherKind mismatch at index ${index}`;
    }
    if (edge.resolved && options.center && options.direction === "incoming" && edge.otherNode.slug !== edge.from) {
      return `${label} edge otherNode source mismatch at index ${index}`;
    }
    if (edge.resolved && options.center && options.direction === "outgoing" && edge.otherNode.slug !== edge.to) {
      return `${label} edge otherNode target mismatch at index ${index}`;
    }
    if (edge.external && edge.otherNode !== null) {
      return `${label} external edge has otherNode at index ${index}`;
    }
  }
  return null;
}

function containmentSummaryRowFailure(label, row, index) {
  if (!row || typeof row !== "object" || Array.isArray(row)) {
    return `${label} malformed row at index ${index}`;
  }
  if (typeof row.slug !== "string" || row.slug.length === 0) {
    return `${label} row missing slug at index ${index}`;
  }
  if (typeof row.via !== "string" || row.via.length === 0) {
    return `${label} row missing via: ${row.slug}`;
  }
  if (!row.node || row.node.slug !== row.slug) {
    return `${label} row missing node summary: ${row.slug}`;
  }
  return null;
}

function candidateGroupShapeFailure(label, group, expectedTotal) {
  if (!group || typeof group !== "object" || Array.isArray(group)) {
    return `${label} missing group`;
  }
  if (!Number.isInteger(group.total) || group.total < 0) {
    return `${label} missing total`;
  }
  if (group.total !== expectedTotal) {
    return `${label} total mismatch — summary ${expectedTotal}, group ${group.total}`;
  }
  if (typeof group.limited !== "boolean") {
    return `${label} missing limited flag`;
  }
  if (!Array.isArray(group.rows)) {
    return `${label} missing rows`;
  }
  if (group.rows.length > group.total) {
    return `${label} rows exceed total — rows ${group.rows.length}, total ${group.total}`;
  }
  if (!group.limited && group.rows.length !== group.total) {
    return `${label} row count mismatch — rows ${group.rows.length}, total ${group.total}`;
  }
  if (group.ignored != null && (!Number.isInteger(group.ignored) || group.ignored < 0)) {
    return `${label} malformed ignored count`;
  }
  for (const [index, row] of group.rows.entries()) {
    const rowFailure = growthCandidateRowFailure(label, row, index);
    if (rowFailure) return rowFailure;
  }
  return null;
}

function growthCandidateRowFailure(label, row, index, { requireProposedAction = false } = {}) {
  if (!row || typeof row !== "object" || Array.isArray(row)) {
    return `${label} malformed row at index ${index}`;
  }
  if (typeof row.kind !== "string" || row.kind.length === 0) {
    return `${label} row missing kind at index ${index}`;
  }
  if (typeof row.score !== "number" || !Number.isFinite(row.score) || row.score < 0) {
    return `${label} row missing score: ${row.kind}`;
  }
  if (typeof row.reason !== "string" || row.reason.length === 0) {
    return `${label} row missing reason: ${row.kind}`;
  }
  if (requireProposedAction && (!row.proposedAction || typeof row.proposedAction !== "object" || Array.isArray(row.proposedAction))) {
    return `${label} row missing proposedAction: ${row.kind}`;
  }
  if (row.proposedAction) {
    if (typeof row.proposedAction.tool !== "string" || row.proposedAction.tool.length === 0) {
      return `${label} proposedAction missing tool: ${row.kind}`;
    }
    if (!row.proposedAction.args || typeof row.proposedAction.args !== "object" || Array.isArray(row.proposedAction.args)) {
      return `${label} proposedAction missing args: ${row.kind}`;
    }
    const actionFailure = growthProposedActionFailure(label, row);
    if (actionFailure) return actionFailure;
  }
  return null;
}

function growthProposedActionFailure(label, row) {
  const { tool, args } = row.proposedAction;
  if (row.kind === "missing_domain_containment") {
    if (tool !== "add_relation") {
      return `${label} proposedAction tool mismatch: ${row.kind}`;
    }
    if (args.from !== row.from || args.to !== row.to || args.type !== row.relation) {
      return `${label} proposedAction relation args mismatch: ${row.kind}`;
    }
  }
  if (row.kind === "materialize_external_element") {
    if (tool !== "add_concept") {
      return `${label} proposedAction tool mismatch: ${row.kind}`;
    }
    if (args.slug !== row.suggestedSlug) {
      return `${label} proposedAction slug mismatch: ${row.kind}`;
    }
    if (args.kind !== "element") {
      return `${label} proposedAction kind mismatch: ${row.kind}`;
    }
  }
  if (row.kind === "resolve_dangling_reference") {
    if (tool !== "add_concept") {
      return `${label} proposedAction tool mismatch: ${row.kind}`;
    }
    if (args.slug !== row.suggestedSlug) {
      return `${label} proposedAction slug mismatch: ${row.kind}`;
    }
    if (args.kind !== row.inferredKind) {
      return `${label} proposedAction kind mismatch: ${row.kind}`;
    }
  }
  return null;
}

function scopeEdgeBucketFailure(label, bucket) {
  if (!bucket || typeof bucket !== "object" || Array.isArray(bucket)) {
    return `${label} missing bucket`;
  }
  if (!Number.isInteger(bucket.total) || bucket.total < 0) {
    return `${label} missing total`;
  }
  if (typeof bucket.limited !== "boolean") {
    return `${label} missing limited flag`;
  }
  if (!bucket.byRelation || typeof bucket.byRelation !== "object" || Array.isArray(bucket.byRelation)) {
    return `${label} missing byRelation`;
  }
  if (!Array.isArray(bucket.edges)) {
    return `${label} missing edges array`;
  }
  if (bucket.edges.length > bucket.total) {
    return `${label} edges exceed total — edges ${bucket.edges.length}, total ${bucket.total}`;
  }
  if (!bucket.limited && bucket.edges.length !== bucket.total) {
    return `${label} edge count mismatch — edges ${bucket.edges.length}, total ${bucket.total}`;
  }
  for (const [index, edge] of bucket.edges.entries()) {
    if (!edge || typeof edge !== "object" || Array.isArray(edge)) {
      return `${label} malformed edge at index ${index}`;
    }
    if (typeof edge.from !== "string" || edge.from.length === 0) {
      return `${label} missing edge from at index ${index}`;
    }
    if (typeof edge.to !== "string" || edge.to.length === 0) {
      return `${label} missing edge to at index ${index}`;
    }
    if (typeof edge.via !== "string" || edge.via.length === 0) {
      return `${label} missing edge relation at index ${index}`;
    }
  }
  return null;
}

function summarizedNodeBucketFailure(label, bucket) {
  if (!bucket || typeof bucket !== "object" || Array.isArray(bucket)) {
    return `${label} missing bucket`;
  }
  if (!Number.isInteger(bucket.total) || bucket.total < 0) {
    return `${label} missing total`;
  }
  if (typeof bucket.limited !== "boolean") {
    return `${label} missing limited flag`;
  }
  if (!Array.isArray(bucket.nodes)) {
    return `${label} missing nodes array`;
  }
  if (bucket.nodes.length > bucket.total) {
    return `${label} nodes exceed total — nodes ${bucket.nodes.length}, total ${bucket.total}`;
  }
  if (!bucket.limited && bucket.nodes.length !== bucket.total) {
    return `${label} node count mismatch — nodes ${bucket.nodes.length}, total ${bucket.total}`;
  }
  return matchRowsFailure(label, bucket.nodes);
}

function summarizedRowBucketFailure(label, bucket, expectedTotal = null) {
  if (!bucket || typeof bucket !== "object" || Array.isArray(bucket)) {
    return `${label} missing bucket`;
  }
  if (!Number.isInteger(bucket.total) || bucket.total < 0) {
    return `${label} missing total`;
  }
  if (expectedTotal != null && bucket.total !== expectedTotal) {
    return `${label} total mismatch — summary ${expectedTotal}, bucket ${bucket.total}`;
  }
  if (typeof bucket.limited !== "boolean") {
    return `${label} missing limited flag`;
  }
  if (!Array.isArray(bucket.rows)) {
    return `${label} missing rows`;
  }
  if (bucket.rows.length > bucket.total) {
    return `${label} rows exceed total — rows ${bucket.rows.length}, total ${bucket.total}`;
  }
  if (!bucket.limited && bucket.rows.length !== bucket.total) {
    return `${label} row count mismatch — rows ${bucket.rows.length}, total ${bucket.total}`;
  }
  return matchRowsFailure(label, bucket.rows);
}

function matchesShapeFailure(label, result) {
  if (!Number.isInteger(result.total) || result.total < 0) {
    return `${label} response missing total count`;
  }
  if (!Array.isArray(result.matches)) {
    return `${label} response missing matches array`;
  }
  if (result.matches.length > result.total) {
    return `${label} response match count exceeds total — matches ${result.matches.length}, total ${result.total}`;
  }
  return matchRowsFailure(label, result.matches);
}

function orphansShapeFailure(result) {
  if (!Number.isInteger(result.total) || result.total < 0) {
    return "find_orphans response missing total count";
  }
  if (!Array.isArray(result.orphans)) {
    return "find_orphans response missing orphans array";
  }
  if (result.orphans.length > result.total) {
    return `find_orphans response orphan count exceeds total — orphans ${result.orphans.length}, total ${result.total}`;
  }
  return matchRowsFailure("find_orphans", result.orphans);
}

function matchRowsFailure(label, rows) {
  for (const [index, row] of rows.entries()) {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      return `${label} response malformed row at index ${index}`;
    }
    if (typeof row.slug !== "string" || row.slug.length === 0) {
      return `${label} response missing row slug at index ${index}`;
    }
    if (typeof row.kind !== "string" || row.kind.length === 0) {
      return `${label} response missing row kind: ${row.slug}`;
    }
    if (typeof row.title !== "string" || row.title.length === 0) {
      return `${label} response missing row title: ${row.slug}`;
    }
  }
  return null;
}

function pathShapeFailure(result) {
  if (typeof result.found !== "boolean") {
    return "find_path response missing found flag";
  }
  if (!result.found) return null;
  if (!Number.isInteger(result.hopCount) || result.hopCount < 0) {
    return "find_path response missing hopCount";
  }
  if (!Array.isArray(result.hops)) {
    return "find_path response missing hops array";
  }
  if (result.hops.length !== result.hopCount + 1) {
    return `find_path response hop mismatch — hopCount ${result.hopCount}, hops ${result.hops.length}`;
  }
  if (result.hops.some((hop) => !isNonBlankString(hop))) {
    return "find_path response contains empty hop";
  }
  if (!Array.isArray(result.edges)) {
    return "find_path response missing edges array";
  }
  if (result.edges.length !== result.hopCount) {
    return `find_path response edge mismatch — hopCount ${result.hopCount}, edges ${result.edges.length}`;
  }
  for (const [index, edge] of result.edges.entries()) {
    if (!edge || typeof edge !== "object" || Array.isArray(edge)) {
      return `find_path response malformed edge at index ${index}`;
    }
    if (edge.from !== result.hops[index] || edge.to !== result.hops[index + 1]) {
      return `find_path response edge/hop mismatch at index ${index}`;
    }
    if (!isNonBlankString(edge.via)) {
      return `find_path response missing edge via at index ${index}`;
    }
  }
  return null;
}

function workspaceBriefShapeFailure(result, label = "workspace_brief") {
  if (result.operation !== "workspace_brief") {
    return `${label} response operation mismatch — ${result.operation}`;
  }
  if (!isNonBlankString(result.status)) {
    return `${label} response missing status`;
  }
  const summaryFailure = numericSummaryFailure(label, result.summary, ["nodes", "edges", "issues"]);
  if (summaryFailure) return summaryFailure;
  const growthFailure = workspaceBriefGrowthFailure(label, result);
  if (growthFailure) return growthFailure;
  if (!Array.isArray(result.nextActions)) {
    return `${label} response missing nextActions array`;
  }
  for (const [index, action] of result.nextActions.entries()) {
    if (!action || typeof action !== "object" || Array.isArray(action)) {
      return `${label} response malformed nextAction at index ${index}`;
    }
    if (!isNonBlankString(action.severity)) {
      return `${label} response missing nextAction severity at index ${index}`;
    }
    if (!NEXT_ACTION_SEVERITIES.has(action.severity)) {
      return `${label} response unknown nextAction severity at index ${index}: ${action.severity}`;
    }
    if (!isNonBlankString(action.id) && !isNonBlankString(action.kind)) {
      return `${label} response missing nextAction identifier at index ${index}`;
    }
    if (!hasOptionalNonNegativeInteger(action.count)) {
      return `${label} response malformed nextAction count at index ${index}`;
    }
    const sampleFailure = workspaceNextActionSampleFailure(label, action, index);
    if (sampleFailure) return sampleFailure;
  }
  if (!result.health || typeof result.health !== "object" || Array.isArray(result.health)) {
    return `${label} response missing health block`;
  }
  return checksShapeFailure(label, result.health.checks, { requireNonEmpty: true });
}

function workspaceBriefGrowthFailure(label, result) {
  if (result.growth == null) return null;
  const growthFailure = numericSummaryFailure(`${label} growth`, result.growth, [
    "relationRecommendations",
    "externalElementRefs",
    "danglingReferences",
    "unassignedNodes",
    "emptyDomains",
    "totalActions",
  ]);
  if (growthFailure) return growthFailure;
  if (result.summary.growthActions != null && result.summary.growthActions !== result.growth.totalActions) {
    return `${label} growthActions mismatch — summary ${result.summary.growthActions}, growth ${result.growth.totalActions}`;
  }
  for (const action of Array.isArray(result.nextActions) ? result.nextActions : []) {
    if (action.kind === "add_missing_relations" && action.count !== result.growth.relationRecommendations) {
      return `${label} add_missing_relations count mismatch — nextAction ${action.count}, growth ${result.growth.relationRecommendations}`;
    }
    if (action.kind === "resolve_dangling_references" && action.count !== result.growth.danglingReferences) {
      return `${label} resolve_dangling_references count mismatch — nextAction ${action.count}, growth ${result.growth.danglingReferences}`;
    }
    if (action.kind === "materialize_external_elements" && action.count !== result.growth.externalElementRefs) {
      return `${label} materialize_external_elements count mismatch — nextAction ${action.count}, growth ${result.growth.externalElementRefs}`;
    }
  }
  return null;
}

function workspaceNextActionSampleFailure(label, action, index) {
  if (action.sample == null) return null;
  if (!Array.isArray(action.sample)) {
    return `${label} response malformed nextAction sample at index ${index}`;
  }
  if (action.count != null && action.sample.length > action.count) {
    return `${label} response nextAction sample exceeds count at index ${index}`;
  }
  for (const [sampleIndex, sample] of action.sample.entries()) {
    if (!sample || typeof sample !== "object" || Array.isArray(sample)) {
      return `${label} response malformed nextAction sample row at index ${index}.${sampleIndex}`;
    }
    if (action.kind === "add_missing_relations") {
      const actionFailure = workspaceProposedActionSampleFailure(label, action, sample, index, sampleIndex, "add_relation");
      if (actionFailure) return actionFailure;
      if (typeof sample.args.from !== "string" || typeof sample.args.to !== "string" || typeof sample.args.type !== "string") {
        return `${label} response malformed add_missing_relations sample args at index ${index}.${sampleIndex}`;
      }
    }
    if (action.kind === "materialize_external_elements") {
      const actionFailure = workspaceProposedActionSampleFailure(label, action, sample, index, sampleIndex, "add_concept");
      if (actionFailure) return actionFailure;
      if (typeof sample.args.slug !== "string" || sample.args.kind !== "element") {
        return `${label} response malformed materialize_external_elements sample args at index ${index}.${sampleIndex}`;
      }
    }
    if (action.kind === "resolve_dangling_references") {
      const rowFailure = growthCandidateRowFailure(`${label} nextAction resolve_dangling_references sample`, sample, sampleIndex);
      if (rowFailure) return rowFailure;
      if (sample.kind !== "resolve_dangling_reference") {
        return `${label} response malformed resolve_dangling_references sample kind at index ${index}.${sampleIndex}`;
      }
    }
  }
  return null;
}

function workspaceProposedActionSampleFailure(label, action, sample, index, sampleIndex, expectedTool) {
  if (sample.tool !== expectedTool) {
    return `${label} response nextAction ${action.kind} sample tool mismatch at index ${index}.${sampleIndex}`;
  }
  if (!sample.args || typeof sample.args !== "object" || Array.isArray(sample.args)) {
    return `${label} response nextAction ${action.kind} sample missing args at index ${index}.${sampleIndex}`;
  }
  return null;
}

function healthShapeFailureForDogfood(result, label = "health") {
  if (result.operation !== "health") {
    return `${label} response operation mismatch — ${result.operation}`;
  }
  if (!isNonBlankString(result.status)) {
    return `${label} response missing status`;
  }
  const summaryFailure = numericSummaryFailure(label, result.summary, ["issues", "unresolvedEdges", "dependencyCycles"]);
  if (summaryFailure) return summaryFailure;
  return checksShapeFailure(label, result.checks, { requireNonEmpty: true });
}

function crossToolConsistencyFailures({ kinds, list, validation, compiled, overview }) {
  if (
    (kinds && listKindsFailure(kinds)) ||
    (list && listConceptsFailure(list)) ||
    (validation && validateVaultFailure(validation)) ||
    (compiled && compileSummaryFailure(compiled)) ||
    (overview && overviewFailure(overview))
  ) {
    return [];
  }

  const failures = [];
  const totals = [
    ["list_kinds.total", kinds?.total],
    ["list_concepts.total", list?.total],
    ["compile_ontology.nodeCount", compiled?.nodeCount],
    ["overview.graph.nodes", overview?.graph?.nodes],
  ].filter(([, value]) => Number.isInteger(value));

  if (totals.length > 1) {
    const [, expected] = totals[0];
    for (const [label, value] of totals.slice(1)) {
      if (value !== expected) {
        failures.push(`dogfood count mismatch — ${totals[0][0]} ${expected}, ${label} ${value}`);
      }
    }
  }

  if (kinds?.byKind && compiled?.byKind) {
    const allKinds = new Set([...Object.keys(kinds.byKind), ...Object.keys(compiled.byKind)]);
    for (const kind of [...allKinds].sort()) {
      const kindsCount = kinds.byKind[kind] ?? 0;
      const compiledCount = compiled.byKind[kind] ?? 0;
      if (kindsCount !== compiledCount) {
        failures.push(`dogfood byKind mismatch — ${kind}: list_kinds ${kindsCount}, compile_ontology ${compiledCount}`);
      }
    }
  }
  if (kinds?.byKind && overview?.byKind) {
    const allKinds = new Set([...Object.keys(kinds.byKind), ...Object.keys(overview.byKind)]);
    for (const kind of [...allKinds].sort()) {
      const kindsCount = kinds.byKind[kind] ?? 0;
      const overviewCount = overview.byKind[kind] ?? 0;
      if (kindsCount !== overviewCount) {
        failures.push(`dogfood byKind mismatch — ${kind}: list_kinds ${kindsCount}, overview ${overviewCount}`);
      }
    }
  }

  return failures;
}

function numericSummaryFailure(label, summary, keys) {
  if (!summary || typeof summary !== "object" || Array.isArray(summary)) {
    return `${label} response missing summary`;
  }
  for (const key of keys) {
    if (!Number.isInteger(summary[key]) || summary[key] < 0) {
      return `${label} response missing summary.${key}`;
    }
  }
  return null;
}

function hasOptionalNonNegativeInteger(value) {
  return value == null || (Number.isInteger(value) && value >= 0);
}

function isNonBlankString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function checksShapeFailure(label, checks, { requireNonEmpty = false } = {}) {
  if (!Array.isArray(checks)) {
    return `${label} response missing checks array`;
  }
  if (requireNonEmpty && checks.length === 0) {
    return `${label} response missing health checks`;
  }
  for (const [index, check] of checks.entries()) {
    if (!check || typeof check !== "object" || Array.isArray(check)) {
      return `${label} response malformed check at index ${index}`;
    }
    if (!isNonBlankString(check.id)) {
      return `${label} response missing check id at index ${index}`;
    }
    if (!isNonBlankString(check.status)) {
      return `${label} response missing check status: ${check.id}`;
    }
    if (!HEALTH_CHECK_STATUSES.has(check.status)) {
      return `${label} response unknown check status: ${check.id}=${check.status}`;
    }
    if (!Number.isInteger(check.count) || check.count < 0) {
      return `${label} response missing check count: ${check.id}`;
    }
  }
  return null;
}

function failedHealthChecks(checks) {
  return Array.isArray(checks)
    ? checks.filter((check) => check?.status === "fail").map(healthCheckDiagnosticLabel)
    : [];
}

function healthStatusSummary(result) {
  return [
    `issues:${result?.summary?.issues ?? 0}`,
    `unresolved:${result?.summary?.unresolvedEdges ?? 0}`,
    `cycles:${result?.summary?.dependencyCycles ?? 0}`,
    `${formatCount((result?.checks || []).length, "check")}`,
  ].join(", ");
}

function healthCheckDiagnosticLabel(check) {
  const id = check?.id || "unknown";
  const status = check?.status || "unknown";
  const count = Number.isInteger(check?.count) ? `:${check.count}` : "";
  return `${id}:${status}${count}`;
}

function blockingNextActions(actions) {
  if (!Array.isArray(actions)) return [];
  return actions
    .filter((action) => action?.severity === "warn" || action?.severity === "fail")
    .map(nextActionDiagnosticLabel);
}

function nextActionDiagnosticLabel(action) {
  const label = action?.id || action?.kind || "unknown";
  const severity = action?.severity || "unknown";
  const count = Number.isInteger(action?.count) ? `:${action.count}` : "";
  return `${label}:${severity}${count}`;
}

const COLORS = {
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  cyan: "\x1b[36m",
  yellow: "\x1b[33m",
  green: "\x1b[32m",
  reset: "\x1b[0m",
};

function header(title) {
  console.log(
    `\n${COLORS.bold}${COLORS.cyan}━━ ${title} ━━${COLORS.reset}\n`,
  );
}

async function main() {
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
  const instructionFailure = initializeInstructionsFailure({ result: initialize });
  if (initialize) {
    console.log(`  server: ${initialize.serverInfo?.name || "unknown"}@${initialize.serverInfo?.version || "unknown"}`);
    console.log(`  instructions: ${instructionFailure ? `${COLORS.yellow}${instructionFailure}${COLORS.reset}` : `${COLORS.green}pass${COLORS.reset}`}`);
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
  if (strictRelationCheckText) {
    console.log(`  ${strictRelationCheckText}`);
  }

  // 52. strict add_relation rejection
  header("strict add_relation — invalid type rejection");
  const strictAddRelation = responses.find((response) => response.id === 70);
  const strictAddRelationText = strictAddRelation?.result?.content?.[0]?.text || "";
  console.log(`  add_relation type rejected: ${strictAddRelation?.result?.isError === true}`);
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
  console.log(`  strict_maintenance_phase_filter: rejected ${strictMaintenancePhaseFilter?.result?.isError === true}`);
  console.log(`  strict_maintenance_severity_filter: rejected ${strictMaintenanceSeverityFilter?.result?.isError === true}`);
  console.log(`  strict_maintenance_kind_filter: rejected ${strictMaintenanceKindFilter?.result?.isError === true}`);
  console.log(`  strict_relation_filter: ${strictClosestValueSummary(strictRelationFilter)}`);
  console.log(`  strict_find_neighbors_type_filter: ${strictClosestValueSummary(strictFindNeighborsTypeFilter)}`);
  console.log(`  strict_find_orphans_kind_filter: ${strictClosestValueSummary(strictFindOrphansKindFilter)}`);
  console.log(`  strict_find_orphans_exclude_kind_filter: ${strictClosestValueSummary(strictFindOrphansExcludeKindFilter)}`);
  console.log(`  strict_query_concepts_kind_filter: ${strictClosestValueSummary(strictQueryConceptsKindFilter)}`);
  console.log(`  strict_query_concepts_has_key_filter: ${strictClosestValueSummary(strictQueryConceptsHasKeyFilter)}`);
  console.log(`  strict_list_concepts_kind_filter: ${strictClosestValueSummary(strictListConceptsKindFilter)}`);
  console.log(`  strict_relation_check: ${strictClosestValueSummary(strictRelationCheck)}`);
  console.log(`  strict_add_relation: ${strictClosestValueSummary(strictAddRelation)}`);
  console.log(`  strict_graph_kind_filter: ${strictClosestValueSummary(strictGraphKindFilter)}`);
  console.log(`  strict_recommend_relations_kind_filter: ${strictClosestValueSummary(strictRecommendRelationsKindFilter)}`);
  console.log(`  strict_recommend_relations_unsupported_kind_filter: ${strictClosestValueSummary(strictRecommendRelationsUnsupportedKindFilter)}`);
  console.log(`  strict_match_nodes_sort_filter: ${strictClosestValueSummary(strictMatchNodesSortFilter)}`);
  console.log(`  strict_match_edges_type_filter: ${strictClosestValueSummary(strictMatchEdgesTypeFilter)}`);
  console.log(`  strict_graph_from_kind_filter: ${strictClosestValueSummary(strictGraphFromKindFilter)}`);
  console.log(`  strict_graph_to_kind_filter: ${strictClosestValueSummary(strictGraphToKindFilter)}`);
  console.log(`  batch caps: get_concepts ${getConceptsBatchCap?.result?.isError === true} · add_concepts ${addConceptsBatchCap?.result?.isError === true} · add_relations ${addRelationsBatchCap?.result?.isError === true}`);
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

if (fileURLToPath(import.meta.url) === resolve(process.argv[1] ?? "")) {
  process.exitCode = await main().catch((err) => {
    console.error("dogfood walk failed:", err);
    return 1;
  });
}
