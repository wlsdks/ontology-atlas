#!/usr/bin/env node
// R12 #38 — AI agent dogfood 시뮬. 사용자 .mcp.json 등록 후 시나리오와
// 같은 흐름으로 mcp server 에 read tool + first-contact graph diagnosis 호출.
// *진짜 AI agent 입장* 에서
// 받는 정보 quality 측정.
//
// write 안 함 (dogfood vault 보존). list_kinds / list_concepts / get_concepts /
// find_evidence / find_path / find_backlinks / find_orphans /
// validate_vault / compile_ontology(summary) /
// query_ontology overview / query_plan / all_paths / pattern_walk / cycles / topological_order / relation_check / components / recommend_relations / growth_plan / maintenance_plan / workspace_brief / health.

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
  projectMapQueryPlanFailure,
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

export { DOGFOOD_RESPONSE_LABELS, expectedResponseIds, missingResponseLabels };

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

export function buildDogfoodRequests() {
  return [
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
  projectMapPlan,
  projectMap,
  domainProfile,
  domainMatrix,
  components,
  relationCheck,
  maintenancePlan,
  growthPlan,
  relationRecommendations,
  cycles,
  topologicalOrder,
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
  recordResult(failures, "project_map_query_plan", projectMapPlan);
  recordResult(failures, "project_map", projectMap);
  recordResult(failures, "domain_profile", domainProfile);
  recordResult(failures, "domain_matrix", domainMatrix);
  recordResult(failures, "components", components);
  recordResult(failures, "relation_check", relationCheck);
  recordResult(failures, "maintenance_plan", maintenancePlan);
  recordResult(failures, "growth_plan", growthPlan);
  recordResult(failures, "recommend_relations", relationRecommendations);
  recordResult(failures, "cycles", cycles);
  recordResult(failures, "topological_order", topologicalOrder);

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
    const maintenancePlanFailure = maintenancePlanShapeFailure(maintenancePlan);
    if (maintenancePlanFailure) failures.push(maintenancePlanFailure);
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
  }
  return null;
}

function maintenancePlanShapeFailure(result) {
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
  for (const key of ["byPhase", "bySeverity", "byKind"]) {
    if (!result[key] || typeof result[key] !== "object" || Array.isArray(result[key])) {
      return `maintenance_plan response missing ${key}`;
    }
  }
  if (typeof result.limited !== "boolean") {
    return "maintenance_plan response missing limited flag";
  }
  if (!Array.isArray(result.actions)) {
    return "maintenance_plan response missing actions array";
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
  for (const [index, action] of result.actions.entries()) {
    const actionFailure = maintenanceActionFailure(action, index);
    if (actionFailure) return actionFailure;
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
  if (result.operation !== "workspace_brief") {
    return `workspace_brief response operation mismatch — ${result.operation}`;
  }
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
  if (!result.health || typeof result.health !== "object" || Array.isArray(result.health)) {
    return "workspace_brief response missing health block";
  }
  return checksShapeFailure("workspace_brief", result.health.checks, { requireNonEmpty: true });
}

function healthShapeFailureForDogfood(result) {
  if (result.operation !== "health") {
    return `health response operation mismatch — ${result.operation}`;
  }
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

  const requests = buildDogfoodRequests();

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
    console.log(`  healthChecks: ${(brief.health?.checks || []).length}`);
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

  // 16. project_map query_plan
  header(`query_ontology(query_plan project_map)`);
  const projectMapPlan = getResult(responses, 17);
  if (projectMapPlan) {
    console.log(
      `  strategy: ${projectMapPlan.estimate?.strategy ?? "n/a"} · cost ${projectMapPlan.estimate?.costClass ?? "n/a"} · nodes ${projectMapPlan.estimate?.nodeScans ?? "n/a"} · edges ${projectMapPlan.estimate?.edgeScans ?? "n/a"}`,
    );
  }

  // 17. project_map
  header(`query_ontology(project_map)`);
  const projectMap = getResult(responses, 18);
  if (projectMap) {
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
  if (domainProfile) {
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
  if (domainMatrix) {
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
  if (components) {
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
  if (relationCheck) {
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
  if (maintenancePlan) {
    console.log(
      `  actions ${maintenancePlan.actions?.length ?? "n/a"} / remaining ${maintenancePlan.summary?.remainingActions ?? "n/a"} · executable ${maintenancePlan.summary?.executableActions ?? "n/a"} · review ${maintenancePlan.summary?.reviewActions ?? "n/a"}`,
    );
    console.log(
      `  cursor next ${maintenancePlan.cursor?.nextAfterActionId ?? "none"} · hasMore ${maintenancePlan.cursor?.hasMore ?? "n/a"}`,
    );
    for (const action of (maintenancePlan.actions || []).slice(0, 5)) {
      console.log(`  ${action.id}: ${action.phase}/${action.kind} · ${action.severity} · executable ${action.executable}`);
    }
  }

  // 23. growth_plan
  header(`query_ontology(growth_plan)`);
  const growthPlan = getResult(responses, 24);
  if (growthPlan) {
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
  if (relationRecommendations) {
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
  if (cycles) {
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
  if (topologicalOrder) {
    console.log(
      `  acyclic ${topologicalOrder.acyclic ?? "n/a"} · ordered ${topologicalOrder.order?.length ?? "n/a"} / ${topologicalOrder.orderedCount ?? "n/a"} · total ${topologicalOrder.totalNodes ?? "n/a"} · edges ${topologicalOrder.selectedEdges ?? "n/a"}`,
    );
    for (const row of (topologicalOrder.order || []).slice(0, 5)) {
      console.log(`  rank ${row.rank}: ${row.slug}`);
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
    projectMapPlan,
    projectMap,
    domainProfile,
    domainMatrix,
    components,
    relationCheck,
    maintenancePlan,
    growthPlan,
    relationRecommendations,
    cycles,
    topologicalOrder,
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
  console.log(
    `  workspace_brief: ${brief?.status ?? "n/a"} (${(brief?.nextActions || []).length} next actions · ${(brief?.health?.checks || []).length} health checks)`,
  );
  console.log(`  health: ${health?.status ?? "n/a"} (${(health?.checks || []).length} checks)`);
  console.log(`  compile_ontology: ${compiled?.nodeCount ?? "n/a"} nodes · ${compiled?.edgeCount ?? "n/a"} edges · ${compiled?.issueCount ?? "n/a"} issues`);
  console.log(`  overview: ${overview?.graph?.nodes ?? "n/a"} nodes · ${overview?.graph?.edges ?? "n/a"} edges · ${(overview?.hubs || []).length} hubs`);
  console.log(`  pattern_walk: ${patternWalk?.paths?.rows?.length ?? "n/a"} paths (${patternWalk?.paths?.limited ? "limited" : "complete"})`);
  console.log(`  all_paths: ${allPaths?.paths?.length ?? "n/a"} paths (${allPaths?.limited ? "limited" : "complete"})`);
  console.log(`  all_paths query_plan: ${allPathsPlan?.estimate?.costClass ?? "n/a"} · limit ${allPathsPlan?.normalized?.limit ?? "n/a"}`);
  console.log(`  project_map query_plan: ${projectMapPlan?.estimate?.costClass ?? "n/a"} · ${projectMapPlan?.estimate?.strategy ?? "n/a"}`);
  console.log(`  project_map: ${projectMap?.domains?.length ?? "n/a"} domains · ${projectMap?.summary?.capabilities ?? "n/a"} capabilities`);
  console.log(`  domain_profile: ${domainProfile?.capabilities?.total ?? "n/a"} capabilities · ${domainProfile?.elements?.total ?? "n/a"} elements`);
  console.log(`  domain_matrix: ${domainMatrix?.summary?.crossDomainEdges ?? "n/a"} cross-domain edges · ${domainMatrix?.connections?.total ?? "n/a"} connections`);
  console.log(`  components: ${components?.totalComponents ?? "n/a"} total · largest ${components?.largestSize ?? "n/a"}`);
  console.log(`  relation_check: ${relationCheck?.verdict ?? "n/a"} · exists ${relationCheck?.exists ?? "n/a"}`);
  console.log(`  maintenance_plan: ${maintenancePlan?.summary?.remainingActions ?? "n/a"} remaining · ${maintenancePlan?.summary?.executableActions ?? "n/a"} executable`);
  console.log(`  growth_plan: ${growthPlan?.summary?.totalActions ?? "n/a"} actions · ${growthPlan?.summary?.externalElementRefsIgnored ?? "n/a"} ignored external refs`);
  console.log(`  recommend_relations: ${relationRecommendations?.totalRecommendations ?? "n/a"} recommendations`);
  console.log(`  cycles: ${cycles?.totalCycles ?? "n/a"} total`);
  console.log(`  topological_order: ${topologicalOrder?.orderedCount ?? "n/a"} ordered · acyclic ${topologicalOrder?.acyclic ?? "n/a"}`);
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
