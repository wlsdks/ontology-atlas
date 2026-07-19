// Human-readable summary/format helpers for the dogfood MCP walk report and gate.
// Split out of scripts/dogfood-mcp-walk.mjs (structural decomposition, logic unchanged).
import {
  initializeInstructionsFailure,
  structuredContentMismatchSummary,
  structuredContentParityStatus,
  TOOLS_LIST_SCHEMA_CONTRACT_SUMMARY,
  tunedHealthScopeOutputSummary,
  tunedWorkspaceBriefScopeOutputSummary,
  VERIFY_TUNED_HEALTH_ARGS,
  VERIFY_TUNED_WORKSPACE_BRIEF_NODE_LIMIT,
} from "../../../mcp/scripts/verify.mjs";
import { COLORS } from "./colors.mjs";
import { nextActionLabel } from "./shape-validators-workspace.mjs";

export const DOGFOOD_TUNED_HEALTH_ARGS = VERIFY_TUNED_HEALTH_ARGS;
export const DOGFOOD_TUNED_WORKSPACE_BRIEF_NODE_LIMIT = VERIFY_TUNED_WORKSPACE_BRIEF_NODE_LIMIT;

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
  const waitingFor = Array.isArray(missingLabels) && missingLabels.length > 0
    ? missingLabels.join(", ")
    : "unknown JSON-RPC responses";
  return [
    `rpc: timed out after ${timeoutMs}ms waiting for ${waitingFor}.`,
    "Increase OATLAS_DOGFOOD_TIMEOUT_MS for slow dogfood runs.",
    "Example: OATLAS_DOGFOOD_TIMEOUT_MS=12000 pnpm dogfood:walk",
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
    const label = nextActionLabel(action);
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
  if (!/single unknown-field rows include `receivedField` plus one-row `unknownFields`/.test(addConcepts?.description || "")) {
    missing.push("add_concepts single-field repair");
  }
  if (!/multi unknown-field rows report every unknown field/.test(addConcepts?.description || "") || !/Received fields/.test(addConcepts?.description || "")) {
    missing.push("add_concepts multi-field Received fields");
  }
  if (!/duplicate input slugs/.test(addConcepts?.description || "") || !/first-seen `concepts\[m\]`/.test(addConcepts?.description || "")) {
    missing.push("add_concepts duplicate first-seen");
  }
  if (!/structured `rowName` \/ `firstSeenAt`/.test(addConcepts?.description || "")) {
    missing.push("add_concepts duplicate structured row repair");
  }
  if (!/relations\[n\]/.test(addRelations?.description || "")) {
    missing.push("add_relations relations[n]");
  }
  if (!/structured `rowName`/.test(addRelations?.description || "")) {
    missing.push("add_relations structured rowName");
  }
  if (!/single unknown-field rows include `receivedField` plus one-row `unknownFields`/.test(addRelations?.description || "")) {
    missing.push("add_relations single-field repair");
  }
  if (!/multi unknown-field rows report every unknown field/.test(addRelations?.description || "") || !/Received fields/.test(addRelations?.description || "")) {
    missing.push("add_relations multi-field Received fields");
  }
  if (!/`allowedFields`, `receivedFields`/.test(addRelations?.description || "")) {
    missing.push("add_relations structured field lists");
  }
  if (!/unknown type/.test(addRelations?.description || "") || !/closest-value hint/.test(addRelations?.description || "")) {
    missing.push("add_relations closest-value type hint");
  }
  if (!/structured `valueName` \/ `receivedValue` \/ `suggestion` \/ `allowedValues`/.test(addRelations?.description || "")) {
    missing.push("add_relations structured value repair");
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

export function initializeInstructionStatus(initialize, options = {}) {
  const failure = initializeInstructionsFailure({ result: initialize });
  if (failure) {
    return options.color ? `${COLORS.yellow}${failure}${COLORS.reset}` : failure;
  }
  const pass = options.color ? `${COLORS.green}pass${COLORS.reset}` : "pass";
  return `${pass} (tool inventory + safety/recovery guidance)`;
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

export function writeMetadataAbsenceSummary(response) {
  const result = response?.result;
  const structured = result?.structuredContent;
  const keys = ["changed", "alreadyExists", "postWriteMaintenance"];
  const present = keys.filter((key) => (
    Object.prototype.hasOwnProperty.call(result || {}, key)
    || Object.prototype.hasOwnProperty.call(structured || {}, key)
  ));
  return present.length > 0 ? `present ${present.join(", ")}` : "absent";
}

export function batchWriteMetadataAbsenceSummary(payload, structuredPayload, key) {
  const keys = ["changed", "alreadyExists", "postWriteMaintenance"];
  const present = [];
  for (const [label, value] of [["parsed", payload], ["structuredContent", structuredPayload]]) {
    if (!value || typeof value !== "object") continue;
    for (const keyName of keys) {
      if (Object.prototype.hasOwnProperty.call(value, keyName)) {
        present.push(`${label}.${keyName}`);
      }
    }
    const rows = Array.isArray(value[key]) ? value[key] : [];
    for (const [index, row] of rows.entries()) {
      if (row?.ok !== false) continue;
      for (const keyName of keys) {
        if (Object.prototype.hasOwnProperty.call(row || {}, keyName)) {
          present.push(`${label}.${key}[${index}].${keyName}`);
        }
      }
    }
  }
  return present.length > 0 ? `present ${present.join(", ")}` : "absent";
}

export function batchNoWriteMetadataCoverageSummary({
  addConceptsPayload,
  addConceptsStructuredPayload,
  addRelationsPayload,
  addRelationsStructuredPayload,
} = {}) {
  const rows = [
    ["add_concepts", batchWriteMetadataAbsenceSummary(addConceptsPayload, addConceptsStructuredPayload, "concepts")],
    ["add_relations", batchWriteMetadataAbsenceSummary(addRelationsPayload, addRelationsStructuredPayload, "relations")],
  ];
  const absent = rows.filter(([, status]) => status === "absent").length;
  const failures = rows.filter(([, status]) => status !== "absent");
  if (failures.length === 0) return `${absent}/${rows.length} absent`;
  return `${absent}/${rows.length} absent (${failures.map(([tool, status]) => `${tool} ${status}`).join("; ")})`;
}

export function batchRowRepairSummary(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return "n/a";
  const failedRows = rows.filter((row) => row?.ok === false).length;
  const rowNames = rows
    .map((row, index) => row?.rowName || (typeof row?.firstSeenAt === "string" ? `row${index}` : null))
    .filter(Boolean);
  const fieldHints = rows
    .flatMap((row) => Array.isArray(row?.unknownFields) ? row.unknownFields : [])
    .map((field) => (typeof field?.suggestion === "string" ? `${field.name}->${field.suggestion}` : `${field?.name || "unknown"}->?`));
  const valueHints = rows
    .filter((row) => typeof row?.receivedValue === "string")
    .map((row) => (typeof row?.suggestion === "string" ? `${row.valueName || "value"} ${row.receivedValue}->${row.suggestion}` : `${row.valueName || "value"} ${row.receivedValue}->?`));
  const duplicateHints = rows
    .filter((row) => typeof row?.firstSeenAt === "string")
    .map((row) => `${row.conflictSlug || "duplicate"} first ${row.firstSeenAt}`);
  const detail = [...fieldHints, ...valueHints, ...duplicateHints].slice(0, 6).join(", ") || "no structured hints";
  const rowSummary = rowNames.length > 0 ? `; rows ${rowNames.join(", ")}` : "";
  return `${failedRows}/${rows.length} failed (${detail}${rowSummary})`;
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

export function tunedHealthScopeSummary(args = DOGFOOD_TUNED_HEALTH_ARGS) {
  return tunedHealthScopeOutputSummary(args);
}

export function tunedWorkspaceBriefScopeSummary(
  args = DOGFOOD_TUNED_HEALTH_ARGS,
  nodeLimit = DOGFOOD_TUNED_WORKSPACE_BRIEF_NODE_LIMIT,
) {
  return tunedWorkspaceBriefScopeOutputSummary(args, nodeLimit);
}
