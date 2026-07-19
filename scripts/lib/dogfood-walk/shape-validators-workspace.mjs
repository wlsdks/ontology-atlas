// Response-shape validators for the dogfood MCP walk: matches/orphans/path,
// workspace_brief, health, and the cross-tool consistency + next-action
// helpers the gate uses to summarize dogfood-walk health.
// Split out of scripts/dogfood-mcp-walk.mjs (structural decomposition, logic unchanged).
import {
  compileSummaryFailure,
  formatCount,
  listConceptsFailure,
  listKindsFailure,
  overviewFailure,
  validateVaultFailure,
} from "../../../mcp/scripts/verify.mjs";
import { growthCandidateRowFailure } from "./shape-validators-graph-analytics.mjs";

const HEALTH_CHECK_STATUSES = new Set(["pass", "warn", "fail", "info"]);
const NEXT_ACTION_SEVERITIES = new Set(["info", "warn", "fail"]);

export function matchesShapeFailure(label, result) {
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

export function orphansShapeFailure(result) {
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

export function matchRowsFailure(label, rows) {
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

export function pathShapeFailure(result) {
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

export function workspaceBriefShapeFailure(result, label = "workspace_brief") {
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
    if (!isNonBlankString(action.id) || !isNonBlankString(action.kind)) {
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

export function workspaceBriefGrowthFailure(label, result) {
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

export function workspaceNextActionSampleFailure(label, action, index) {
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

export function workspaceProposedActionSampleFailure(label, action, sample, index, sampleIndex, expectedTool) {
  if (sample.tool !== expectedTool) {
    return `${label} response nextAction ${action.kind} sample tool mismatch at index ${index}.${sampleIndex}`;
  }
  if (!sample.args || typeof sample.args !== "object" || Array.isArray(sample.args)) {
    return `${label} response nextAction ${action.kind} sample missing args at index ${index}.${sampleIndex}`;
  }
  return null;
}

export function healthShapeFailureForDogfood(result, label = "health") {
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

export function crossToolConsistencyFailures({ kinds, list, validation, compiled, overview }) {
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

export function numericSummaryFailure(label, summary, keys) {
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

export function hasOptionalNonNegativeInteger(value) {
  return value == null || (Number.isInteger(value) && value >= 0);
}

export function isNonBlankString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

export function checksShapeFailure(label, checks, { requireNonEmpty = false } = {}) {
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

export function failedHealthChecks(checks) {
  return Array.isArray(checks)
    ? checks.filter((check) => check?.status === "fail").map(healthCheckDiagnosticLabel)
    : [];
}

export function healthStatusSummary(result) {
  return [
    `issues:${result?.summary?.issues ?? 0}`,
    `unresolved:${result?.summary?.unresolvedEdges ?? 0}`,
    `cycles:${result?.summary?.dependencyCycles ?? 0}`,
    `${formatCount((result?.checks || []).length, "check")}`,
  ].join(", ");
}

export function healthCheckDiagnosticLabel(check) {
  const id = check?.id || "unknown";
  const status = check?.status || "unknown";
  const count = Number.isInteger(check?.count) ? `:${check.count}` : "";
  return `${id}:${status}${count}`;
}

export function blockingNextActions(actions) {
  if (!Array.isArray(actions)) return [];
  return actions
    .filter((action) => action?.severity === "warn" || action?.severity === "fail")
    .map(nextActionDiagnosticLabel);
}

export function nextActionDiagnosticLabel(action) {
  const label = nextActionLabel(action);
  const severity = action?.severity || "unknown";
  const count = Number.isInteger(action?.count) ? `:${action.count}` : "";
  return `${label}:${severity}${count}`;
}

export function nextActionLabel(action) {
  const id = typeof action?.id === "string" && action.id.trim().length > 0 ? action.id : null;
  const kind = typeof action?.kind === "string" && action.kind.trim().length > 0 ? action.kind : null;
  if (id && kind && id !== kind) return `${id}/${kind}`;
  return id || kind || "unknown";
}
