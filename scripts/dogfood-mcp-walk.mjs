#!/usr/bin/env node
// R12 #38 — AI agent dogfood 시뮬. 사용자 .mcp.json 등록 후 시나리오와
// 같은 흐름으로 mcp server 에 read tool + first-contact graph diagnosis 호출.
// *진짜 AI agent 입장* 에서
// 받는 정보 quality 측정.
//
// write 안 함 (dogfood vault 보존). list_kinds / list_concepts / get_concepts /
// find_evidence / find_path / find_backlinks / find_orphans /
// validate_vault / compile_ontology(summary) /
// query_ontology overview / query_plan / all_paths / pattern_walk / workspace_brief / health.

import { spawn } from "node:child_process";
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
  listConceptsFailure,
  listKindsFailure,
  overviewFailure,
  validateVaultFailure,
} from "../mcp/scripts/verify.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const SERVER = join(ROOT, "mcp", "src", "index.js");
const VAULT = join(ROOT, "docs", "ontology");
const DOGFOOD_TIMEOUT_MS_RAW = process.env.OMOT_DOGFOOD_TIMEOUT_MS;

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
]);

function rpc(requests, timeoutMs = 3000) {
  return new Promise((resolveP, rejectP) => {
    const expectedIds = expectedResponseIds(requests);
    const proc = spawn("node", [SERVER], {
      env: { ...process.env, OMOT_VAULT: VAULT },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let completed = false;
    let timedOut = false;
    let timer = null;
    proc.stdout.on("data", (b) => {
      stdout += b.toString();
      if (!completed && shouldFinishRpc(stdout, expectedIds)) {
        completed = true;
        if (timer) clearTimeout(timer);
        proc.kill("SIGTERM");
      }
    });
    proc.stderr.on("data", (b) => (stderr += b.toString()));

    const lines = requests.map((r) => JSON.stringify(r)).join("\n") + "\n";
    proc.stdin.write(lines);
    timer = setTimeout(() => {
      timedOut = true;
      proc.kill("SIGTERM");
    }, timeoutMs);

    proc.on("close", () => {
      if (timer) clearTimeout(timer);
      const responses = parseRpcResponses(stdout);
      resolveP({ responses, stderr, timedOut });
    });
    proc.on("error", rejectP);
  });
}

export { expectedResponseIds, missingResponseLabels };

export function parseRpcResponses(stdout) {
  return parseJsonRpcResponses(stdout);
}

export function shouldFinishRpc(stdout, expectedIds) {
  return hasAnyErrorResponse(stdout, expectedIds) || hasAllResponses(stdout, expectedIds);
}

export function rpcTimeoutFailure(timeoutMs, missingLabels) {
  return `rpc: timed out after ${timeoutMs}ms waiting for ${missingLabels.join(", ")}`;
}

export function parseDogfoodTimeoutMs(value, fallback = 5000) {
  if (value == null || value === "") return fallback;
  if (!/^[1-9]\d*$/.test(String(value))) return false;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : false;
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
  if (!stderr) return [];
  return stderr
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /Warning:/.test(line))
    .map((line) => `stderr warning: ${line}`);
}

export function evaluateDogfoodGate({
  kinds,
  list,
  batch,
  ev,
  path,
  bl,
  orph,
  validation,
  brief,
  health,
  compiled,
  overview,
  patternWalk,
  allPaths,
  allPathsPlan,
}) {
  const failures = [];
  recordResult(failures, "list_kinds", kinds);
  recordResult(failures, "list_concepts", list);
  recordResult(failures, "get_concepts", batch);
  recordResult(failures, "find_evidence", ev);
  recordResult(failures, "find_path", path);
  recordResult(failures, "find_backlinks", bl);
  recordResult(failures, "find_orphans", orph);
  recordResult(failures, "validate_vault", validation);
  recordResult(failures, "workspace_brief", brief);
  recordResult(failures, "health", health);
  recordResult(failures, "compile_ontology", compiled);
  recordResult(failures, "overview", overview);
  recordResult(failures, "pattern_walk", patternWalk);
  recordResult(failures, "all_paths", allPaths);
  recordResult(failures, "all_paths_query_plan", allPathsPlan);

  if (kinds) {
    const kindsFailure = listKindsFailure(kinds);
    if (kindsFailure) failures.push(kindsFailure);
  }
  if (list) {
    const listFailure = listConceptsFailure(list);
    if (listFailure) failures.push(listFailure);
  }
  if (batch) {
    const batchFailure = getConceptsShapeFailure(batch);
    if (batchFailure) failures.push(batchFailure);
  }
  if (ev) {
    const evidenceFailure = evidenceShapeFailure(ev);
    if (evidenceFailure) failures.push(evidenceFailure);
  }
  if (path) {
    const pathFailure = pathShapeFailure(path);
    if (pathFailure) failures.push(pathFailure);
    else if (!path.found) failures.push("find_path: expected mcp-server → vault-local-first path");
  }
  if (bl) {
    const backlinksFailure = matchesShapeFailure("find_backlinks", bl);
    if (backlinksFailure) failures.push(backlinksFailure);
  }
  if (orph) {
    const orphansFailure = orphansShapeFailure(orph);
    if (orphansFailure) failures.push(orphansFailure);
  }
  if (validation) {
    const validationFailure = validateVaultFailure(validation);
    if (validationFailure) failures.push(validationFailure);
  }
  let briefShapeFailure = null;
  if (brief) {
    briefShapeFailure = workspaceBriefShapeFailure(brief);
    if (briefShapeFailure) failures.push(briefShapeFailure);
  }
  let healthShapeFailure = null;
  if (health) {
    healthShapeFailure = healthShapeFailureForDogfood(health);
    if (healthShapeFailure) failures.push(healthShapeFailure);
  }
  if (compiled) {
    const compileFailure = compileSummaryFailure(compiled);
    if (compileFailure) failures.push(compileFailure);
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
  if (allPaths && allPathsPlan && !allPathsFailure && !allPathsPlanFailure) {
    const plannedLimit = allPathsPlan.normalized.limit;
    if (allPaths.paths.length > plannedLimit) {
      failures.push(`all_paths query_plan limit below returned rows — rows ${allPaths.paths.length}, planned ${plannedLimit}`);
    }
  }
  const consistencyFailures = crossToolConsistencyFailures({ kinds, list, validation, compiled, overview });
  failures.push(...consistencyFailures);
  if (brief && !briefShapeFailure && brief.status !== "healthy") {
    failures.push(`workspace_brief: status ${brief.status}`);
  }
  const briefFailedChecks = failedHealthChecks(brief?.health?.checks);
  if (briefFailedChecks.length > 0) {
    failures.push(`workspace_brief: failing health checks ${briefFailedChecks.join(", ")}`);
  }
  const blockingActions = blockingNextActions(brief?.nextActions);
  if (blockingActions.length > 0) {
    failures.push(`workspace_brief: actionable nextActions ${blockingActions.join(", ")}`);
  }
  if (health && !healthShapeFailure && health.status !== "healthy") {
    failures.push(`health: status ${health.status}`);
  }
  const healthFailedChecks = failedHealthChecks(health?.checks);
  if (healthFailedChecks.length > 0) {
    failures.push(`health: failing health checks ${healthFailedChecks.join(", ")}`);
  }

  return failures;
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
    if (typeof row.slug !== "string" || row.slug.length === 0) {
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
    return "get_concepts response malformed missing row";
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
  if (result.hops.some((hop) => typeof hop !== "string" || hop.length === 0)) {
    return "find_path response contains empty hop";
  }
  return null;
}

function workspaceBriefShapeFailure(result) {
  if (typeof result.status !== "string" || result.status.length === 0) {
    return "workspace_brief response missing status";
  }
  const summaryFailure = numericSummaryFailure("workspace_brief", result.summary, ["nodes", "edges", "issues"]);
  if (summaryFailure) return summaryFailure;
  if (!Array.isArray(result.nextActions)) {
    return "workspace_brief response missing nextActions array";
  }
  for (const [index, action] of result.nextActions.entries()) {
    if (!action || typeof action !== "object" || Array.isArray(action)) {
      return `workspace_brief response malformed nextAction at index ${index}`;
    }
    if (typeof action.severity !== "string" || action.severity.length === 0) {
      return `workspace_brief response missing nextAction severity at index ${index}`;
    }
    if (typeof action.id !== "string" && typeof action.kind !== "string") {
      return `workspace_brief response missing nextAction identifier at index ${index}`;
    }
  }
  if (result.health !== undefined) {
    if (!result.health || typeof result.health !== "object" || Array.isArray(result.health)) {
      return "workspace_brief response malformed health block";
    }
    const checksFailure = checksShapeFailure("workspace_brief", result.health.checks);
    if (checksFailure) return checksFailure;
  }
  return null;
}

function healthShapeFailureForDogfood(result) {
  if (typeof result.status !== "string" || result.status.length === 0) {
    return "health response missing status";
  }
  const summaryFailure = numericSummaryFailure("health", result.summary, ["issues", "unresolvedEdges", "dependencyCycles"]);
  if (summaryFailure) return summaryFailure;
  return checksShapeFailure("health", result.checks, { requireNonEmpty: true });
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
    ["validate_vault.scanned", validation?.scanned],
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
    if (typeof check.id !== "string" || check.id.length === 0) {
      return `${label} response missing check id at index ${index}`;
    }
    if (typeof check.status !== "string" || check.status.length === 0) {
      return `${label} response missing check status: ${check.id}`;
    }
    if (!Number.isInteger(check.count) || check.count < 0) {
      return `${label} response missing check count: ${check.id}`;
    }
  }
  return null;
}

function failedHealthChecks(checks) {
  return Array.isArray(checks)
    ? checks.filter((check) => check?.status === "fail").map((check) => check.id || "unknown")
    : [];
}

function blockingNextActions(actions) {
  if (!Array.isArray(actions)) return [];
  return actions
    .filter((action) => action?.severity === "warn" || action?.severity === "fail")
    .map((action) => action.id || action.kind || "unknown");
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
  const timeoutMs = parseDogfoodTimeoutMs(DOGFOOD_TIMEOUT_MS_RAW);
  if (timeoutMs === false) {
    console.error("OMOT_DOGFOOD_TIMEOUT_MS must be a positive integer");
    process.exit(1);
  }

  console.log(
    `${COLORS.bold}AI agent dogfood walk${COLORS.reset} ${COLORS.dim}(vault=${VAULT})${COLORS.reset}`,
  );

  const requests = [
    ...init,
    call(2, "list_kinds"),
    call(3, "list_concepts", { limit: 30 }),
    call(16, "get_concepts", {
      slugs: ["project", "capabilities/mcp-server", "missing-dogfood-slug"],
    }),
    call(4, "find_evidence", { title: "vault" }),
    call(5, "find_path", {
      from: "capabilities/mcp-server",
      to: "domains/vault-local-first",
    }),
    call(6, "find_backlinks", { slug: "capabilities/mcp-server" }),
    call(7, "find_orphans", {}),
    call(8, "validate_vault", {}),
    call(9, "query_ontology", { operation: "workspace_brief", limit: 5 }),
    call(10, "query_ontology", { operation: "health" }),
    call(11, "compile_ontology", { summary: true }),
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
  ];

  const { responses, stderr, timedOut } = await rpc(requests, timeoutMs);

  // 1. list_kinds
  header("list_kinds — vault census");
  const kinds = getResult(responses, 2);
  if (kinds) {
    console.log(`  total: ${kinds.total}`);
    console.log(`  byKind:`);
    for (const [k, n] of Object.entries(kinds.byKind || {})) {
      console.log(`    ${k.padEnd(15)} ${n}`);
    }
  }

  // 2. list_concepts (preview)
  header("list_concepts — preview (top 8)");
  const list = getResult(responses, 3);
  if (list) {
    console.log(`  total: ${list.total}`);
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

  // 3. get_concepts (batch reader + partial row)
  header("get_concepts — batch read + partial row");
  const batch = getResult(responses, 16);
  if (batch) {
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

  // 4. find_evidence
  header(`find_evidence(title="vault")`);
  const ev = getResult(responses, 4);
  if (ev) {
    console.log(`  matches: ${ev.matches?.length || 0}`);
    for (const m of (ev.matches || []).slice(0, 5)) {
      console.log(`  ${m.kind?.padEnd(13) || ""} ${m.slug.padEnd(40)} (${m.matchedIn})`);
    }
  }

  // 5. find_path
  header(`find_path(capabilities/mcp-server → domains/vault-local-first)`);
  const path = getResult(responses, 5);
  if (path) {
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
  if (bl) {
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
  if (orph) {
    console.log(`  total: ${orph.total}`);
    for (const m of (orph.orphans || []).slice(0, 8)) {
      console.log(`  ${m.kind?.padEnd(13) || ""} ${m.slug.padEnd(40)} ${m.title || ""}`);
    }
  }

  // 8. validate_vault
  header(`validate_vault`);
  const validation = getResult(responses, 8);
  if (validation) {
    console.log(`  scanned: ${validation.scanned ?? "n/a"}`);
    console.log(
      `  problemFiles: ${validation.summary?.problemFiles ?? "n/a"} · errors ${validation.summary?.errorFiles ?? "n/a"} · warnings ${validation.summary?.warningFiles ?? "n/a"}`,
    );
    for (const problem of (validation.problems || []).slice(0, 5)) {
      const codes = (problem.issues || []).map((issue) => issue.code).join(",");
      console.log(`  ${problem.slug || "unknown"} ${codes}`);
    }
  }

  // 9. workspace_brief
  header(`query_ontology(workspace_brief)`);
  const brief = getResult(responses, 9);
  if (brief) {
    console.log(`  status: ${brief.status}`);
    console.log(
      `  summary: nodes ${brief.summary?.nodes ?? "n/a"} · edges ${brief.summary?.edges ?? "n/a"} · issues ${brief.summary?.issues ?? "n/a"}`,
    );
    console.log(`  nextActions: ${(brief.nextActions || []).length}`);
    for (const action of (brief.nextActions || []).slice(0, 5)) {
      console.log(`  ${action.kind?.padEnd(18) || ""} ${action.id || ""}`);
    }
  }

  // 10. health
  header(`query_ontology(health)`);
  const health = getResult(responses, 10);
  if (health) {
    console.log(`  status: ${health.status}`);
    console.log(
      `  summary: issues ${health.summary?.issues ?? "n/a"} · unresolved ${health.summary?.unresolvedEdges ?? "n/a"} · cycles ${health.summary?.dependencyCycles ?? "n/a"}`,
    );
    for (const check of health.checks || []) {
      console.log(`  ${check.status?.padEnd(6) || ""} ${check.id.padEnd(26)} ${check.count}`);
    }
  }

  // 11. compile_ontology(summary)
  header(`compile_ontology(summary)`);
  const compiled = getResult(responses, 11);
  if (compiled) {
    console.log(`  graphHash: ${compiled.graphHash || "n/a"}`);
    console.log(
      `  nodes ${compiled.nodeCount ?? "n/a"} · edges ${compiled.edgeCount ?? "n/a"} · issues ${compiled.issueCount ?? "n/a"} · canonicalization ${compiled.canonicalizationActionCount ?? "n/a"}`,
    );
  }

  // 12. overview
  header(`query_ontology(overview)`);
  const overview = getResult(responses, 15);
  if (overview) {
    console.log(
      `  graph ${overview.graph?.graphHash?.slice(0, 12) ?? "n/a"} · nodes ${overview.graph?.nodes ?? "n/a"} · edges ${overview.graph?.edges ?? "n/a"} · hubs ${(overview.hubs || []).length}`,
    );
  }

  // 13. pattern_walk
  header(`query_ontology(pattern_walk project → domains → capabilities)`);
  const patternWalk = getResult(responses, 12);
  if (patternWalk) {
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
  if (allPaths) {
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
  if (allPathsPlan) {
    console.log(
      `  strategy: ${allPathsPlan.estimate?.strategy ?? "n/a"} · limit ${allPathsPlan.normalized?.limit ?? "n/a"} · upper ${allPathsPlan.estimate?.resultUpperBound ?? "n/a"} · cost ${allPathsPlan.estimate?.costClass ?? "n/a"}`,
    );
    for (const warning of allPathsPlan.warnings || []) {
      console.log(`  warning: ${warning}`);
    }
  }

  const failures = evaluateDogfoodGate({
    kinds,
    list,
    batch,
    ev,
    path,
    bl,
    orph,
    validation,
    brief,
    health,
    compiled,
    overview,
    patternWalk,
    allPaths,
    allPathsPlan,
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
  console.log(`  orphans: ${orphCount} (${orphRatio}%)`);
  console.log(
    `  list_concepts vaultWarnings: ${list?.vaultWarnings ? "있음 (vault 정합성 회귀!)" : "0 (clean)"}`,
  );
  console.log(`  get_concepts: ${(batch?.concepts || []).filter((row) => row?.ok === true).length} ok · ${(batch?.concepts || []).filter((row) => row?.ok === false).length} partial`);
  console.log(`  validate_vault: ${validation?.summary?.problemFiles ?? "n/a"} problem files`);
  console.log(`  find_path hop: ${path?.hopCount ?? "n/a"}`);
  console.log(`  find_backlinks: ${bl?.total ?? "n/a"} (mcp-server 가 얼마나 popular)`);
  console.log(`  workspace_brief: ${brief?.status ?? "n/a"} (${(brief?.nextActions || []).length} next actions)`);
  console.log(`  health: ${health?.status ?? "n/a"} (${(health?.checks || []).length} checks)`);
  console.log(`  compile_ontology: ${compiled?.nodeCount ?? "n/a"} nodes · ${compiled?.edgeCount ?? "n/a"} edges · ${compiled?.issueCount ?? "n/a"} issues`);
  console.log(`  overview: ${overview?.graph?.nodes ?? "n/a"} nodes · ${overview?.graph?.edges ?? "n/a"} edges · ${(overview?.hubs || []).length} hubs`);
  console.log(`  pattern_walk: ${patternWalk?.paths?.rows?.length ?? "n/a"} paths (${patternWalk?.paths?.limited ? "limited" : "complete"})`);
  console.log(`  all_paths: ${allPaths?.paths?.length ?? "n/a"} paths (${allPaths?.limited ? "limited" : "complete"})`);
  console.log(`  all_paths query_plan: ${allPathsPlan?.estimate?.costClass ?? "n/a"} · limit ${allPathsPlan?.normalized?.limit ?? "n/a"}`);
  console.log(`  gate: ${failures.length === 0 ? `${COLORS.green}pass${COLORS.reset}` : `${COLORS.yellow}fail${COLORS.reset}`}`);

  if (stderr.trim()) {
    console.log(
      `\n${COLORS.dim}[stderr]${COLORS.reset}\n${stderr.trim().split("\n").slice(0, 5).join("\n")}`,
    );
  }

  if (failures.length > 0) {
    console.error(`\n${COLORS.yellow}dogfood walk failed gate:${COLORS.reset}`);
    for (const failure of failures) {
      console.error(`  - ${failure}`);
    }
    process.exit(1);
  }
}

if (fileURLToPath(import.meta.url) === resolve(process.argv[1] ?? "")) {
  main().catch((err) => {
    console.error("dogfood walk failed:", err);
    process.exit(1);
  });
}
