#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_VAULT = "docs/ontology";
const DEFAULT_FROM = "capabilities/cli-developer-entry";
const DEFAULT_TO = "capabilities/mcp-server";
const DEFAULT_FOCUS = "capabilities/mcp-server";

const GRAPH_DB_PACK_COMMANDS = [
  {
    id: "self_check",
    args: [
      "cli/src/index.mjs",
      "agent-brief",
      DEFAULT_VAULT,
      "--verify-fallbacks",
      "--json",
      "--fallback-timeout-ms",
      "15000",
      "--fallback-slow-ms",
      "5000",
      "--fallback-concurrency",
      "4",
    ],
    validate: validateSelfCheck,
  },
  {
    id: "facets",
    args: ["cli/src/index.mjs", "facets", DEFAULT_VAULT, "--limit", "10", "--json"],
    validate: validateFacets,
  },
  {
    id: "health_gate",
    args: ["cli/src/index.mjs", "health", DEFAULT_VAULT, "--json"],
    validate: validateHealthGate,
  },
  {
    id: "node_scan",
    args: [
      "cli/src/index.mjs",
      "match-nodes",
      DEFAULT_VAULT,
      "--plan",
      "--kind",
      "capability",
      "--min-degree",
      "2",
      "--sort",
      "degree",
      "--limit",
      "10",
      "--json",
    ],
    validate: validateNodeScan,
  },
  {
    id: "focused_blast_radius",
    args: [
      "cli/src/index.mjs",
      "blast-radius",
      DEFAULT_FOCUS,
      DEFAULT_VAULT,
      "--depth",
      "2",
      "--direction",
      "incoming",
      "--json",
    ],
    validate: validateFocusedBlastRadius,
  },
  {
    id: "edge_scan",
    args: [
      "cli/src/index.mjs",
      "match-edges",
      DEFAULT_VAULT,
      "--plan",
      "--types",
      "depends_on",
      "--limit",
      "20",
      "--json",
    ],
    validate: validateEdgeScan,
  },
  {
    id: "relation_name_parity",
    args: [
      "cli/src/index.mjs",
      "match-edges",
      DEFAULT_VAULT,
      "--plan",
      "--types",
      "depends_on",
      "--limit",
      "5",
      "--json",
    ],
    validate: validateRelationNameParity,
  },
  {
    id: "frontmatter_edge_scan",
    args: [
      "cli/src/index.mjs",
      "match-edges",
      DEFAULT_VAULT,
      "--plan",
      "--from-kind",
      "capability",
      "--to-kind",
      "element",
      "--type",
      "elements",
      "--limit",
      "10",
      "--json",
    ],
    validate: validateFrontmatterEdgeScan,
  },
  {
    id: "domain_coupling",
    args: [
      "cli/src/index.mjs",
      "domain-matrix",
      DEFAULT_VAULT,
      "--limit",
      "6",
      "--types",
      "depends_on,relates",
      "--json",
    ],
    validate: validateDomainCoupling,
  },
  {
    id: "structural_traversal",
    args: [
      "cli/src/index.mjs",
      "pattern-walk",
      "project",
      DEFAULT_VAULT,
      "--pattern",
      "domains,capabilities",
      "--limit",
      "5",
      "--json",
    ],
    validate: validateStructuralTraversal,
  },
  {
    id: "project_map",
    args: [
      "cli/src/index.mjs",
      "project-map",
      "project",
      DEFAULT_VAULT,
      "--limit",
      "5",
      "--json",
    ],
    validate: validateProjectMap,
  },
  {
    id: "path_evidence",
    args: [
      "cli/src/index.mjs",
      "all-paths",
      DEFAULT_FROM,
      DEFAULT_TO,
      DEFAULT_VAULT,
      "--plan",
      "--force",
      "--max-hops",
      "3",
      "--types",
      "depends_on,relates",
      "--search-budget",
      "1000",
      "--limit",
      "10",
      "--json",
    ],
    validate: validatePathEvidence,
  },
  {
    id: "relation_preflight",
    args: [
      "cli/src/index.mjs",
      "relation-check",
      DEFAULT_FROM,
      DEFAULT_TO,
      "depends_on",
      DEFAULT_VAULT,
      "--json",
    ],
    validate: validateRelationPreflight,
  },
  {
    id: "relation_explain",
    args: [
      "cli/src/index.mjs",
      "explain",
      DEFAULT_FROM,
      DEFAULT_TO,
      DEFAULT_VAULT,
      "--direction",
      "undirected",
      "--max-hops",
      "5",
      "--types",
      "depends_on,relates",
      "--limit",
      "10",
      "--json",
    ],
    validate: validateRelationExplain,
  },
];

export function runDogfoodGraphDbPack({
  spawn = spawnSync,
  cwd = process.cwd(),
  stdout = process.stdout,
  stderr = process.stderr,
} = {}) {
  const results = [];

  for (const command of GRAPH_DB_PACK_COMMANDS) {
    const result = spawn(process.execPath, command.args, {
      cwd,
      encoding: "utf8",
      maxBuffer: 1024 * 1024 * 16,
    });
    if (result.error) {
      stderr.write(`[dogfood:graph-db] ${command.id} failed to start: ${result.error.message}\n`);
      return 1;
    }
    if (typeof result.status === "number" && result.status !== 0) {
      stderr.write(result.stderr || "");
      stderr.write(`[dogfood:graph-db] ${command.id} exited ${result.status}\n`);
      return result.status;
    }
    const parsed = parseJsonOutput(result.stdout, command.id);
    if (!parsed.ok) {
      stderr.write(`${parsed.error}\n`);
      return 1;
    }
    const check = command.validate(parsed.value);
    if (!check.ok) {
      stderr.write(`[dogfood:graph-db] ${command.id} failed: ${check.error}\n`);
      return 1;
    }
    results.push({ id: command.id, summary: check.summary });
    stdout.write(`[dogfood:graph-db] ${command.id}: ${check.summary}\n`);
  }

  stdout.write(`[dogfood:graph-db] ok · ${results.length} runtime graph DB checks passed\n`);
  return 0;
}

export function parseJsonOutput(stdout, label) {
  try {
    return { ok: true, value: JSON.parse(stdout) };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, error: `[dogfood:graph-db] ${label} returned invalid JSON: ${message}` };
  }
}

function pass(summary) {
  return { ok: true, summary };
}

function fail(error) {
  return { ok: false, error };
}

function validateSelfCheck(value) {
  if (value?.ok !== true) return fail("agent setup gate ok=false");
  if (value?.performanceOk !== true) return fail("agent setup gate performanceOk=false");
  if (value?.failed !== 0) return fail(`agent setup gate failed=${value?.failed}`);
  const commandCount = Array.isArray(value?.commands) ? value.commands.length : 0;
  if (commandCount < 20) return fail(`expected at least 20 fallback commands, received ${commandCount}`);
  return pass(`ok=true performanceOk=true commands=${commandCount}`);
}

function validateFacets(value) {
  const graph = value?.graph;
  if (!graph || graph.nodes <= 0 || graph.edges <= 0) return fail("facets graph counts missing");
  if (graph.unresolvedEdges !== 0) return fail(`expected unresolvedEdges=0, received ${graph.unresolvedEdges}`);
  if (!Array.isArray(value?.nodes?.topByDegree) || value.nodes.topByDegree.length === 0) {
    return fail("facets topByDegree rows missing");
  }
  return pass(`${graph.nodes} nodes · ${graph.edges} edges · unresolved=${graph.unresolvedEdges}`);
}

function validateHealthGate(value) {
  if (value?.operation !== "health") return fail("health result missing");
  if (value.status !== "healthy") return fail(`health status=${value.status}`);
  const summary = value.summary;
  if (!summary || typeof summary.nodes !== "number" || typeof summary.edges !== "number") {
    return fail("health summary graph counts missing");
  }
  if (summary.unresolvedEdges !== 0) {
    return fail(`expected health unresolvedEdges=0, received ${summary.unresolvedEdges}`);
  }
  if (summary.issues !== 0) {
    return fail(`expected health issues=0, received ${summary.issues}`);
  }
  if (!Array.isArray(value.checks) || value.checks.length === 0) {
    return fail("health checks missing");
  }
  for (const check of value.checks) {
    if (typeof check?.id !== "string" || check.id.trim() === "") {
      return fail("health check id missing");
    }
    if (check.status !== "pass") {
      return fail(`health check ${check.id} status=${check.status}`);
    }
    if (typeof check.count !== "number" || check.count < 0) {
      return fail(`health check ${check.id} count invalid`);
    }
  }
  return pass(
    `status=healthy checks=${value.checks.length} issues=${summary.issues} unresolved=${summary.unresolvedEdges}`,
  );
}

function validateNodeScan(value) {
  const plan = value?.plan;
  const result = value?.result;
  if (plan?.execution?.shouldRun !== true) return fail("match_nodes plan did not recommend run");
  if (result?.operation !== "match_nodes") return fail("match_nodes result missing");
  if (!Array.isArray(result.nodes) || result.nodes.length === 0) return fail("match_nodes returned no rows");
  if (typeof result.totalMatches !== "number" || result.totalMatches < result.nodes.length) {
    return fail("match_nodes totalMatches contract invalid");
  }
  const followUp = result.followUp;
  if (typeof followUp?.focusSlug !== "string" || followUp.focusSlug.length === 0) {
    return fail("match_nodes followUp.focusSlug missing");
  }
  if (!Array.isArray(followUp.calls) || followUp.calls.length === 0) {
    return fail("match_nodes followUp.calls missing");
  }
  if (
    !Array.isArray(followUp.cliFallbackCommands) ||
    followUp.cliFallbackCommands.length === 0
  ) {
    return fail("match_nodes followUp.cliFallbackCommands missing");
  }
  return pass(
    `totalMatches=${result.totalMatches} limited=${Boolean(result.limited)} followUp=${followUp.calls.length}`,
  );
}

function validateFocusedBlastRadius(value) {
  if (value?.operation !== "blast_radius") return fail("blast_radius result missing");
  if (value.center !== DEFAULT_FOCUS) {
    return fail(`blast_radius center=${value.center}`);
  }
  if (value.direction !== "incoming") {
    return fail(`blast_radius direction=${value.direction}`);
  }
  if (value.depth !== 2) {
    return fail(`blast_radius depth=${value.depth}`);
  }
  if (!value.node || value.node.slug !== DEFAULT_FOCUS) {
    return fail("blast_radius focused node missing");
  }
  const summary = value.summary;
  if (!summary || typeof summary.affectedNodes !== "number" || summary.affectedNodes <= 0) {
    return fail("blast_radius affectedNodes summary missing");
  }
  if (typeof summary.affectedEdges !== "number" || summary.affectedEdges <= 0) {
    return fail("blast_radius affectedEdges summary missing");
  }
  if (!value.nodes || typeof value.nodes.total !== "number" || !Array.isArray(value.nodes.rows)) {
    return fail("blast_radius nodes contract missing");
  }
  if (!value.edges || typeof value.edges.total !== "number" || !Array.isArray(value.edges.rows)) {
    return fail("blast_radius edges contract missing");
  }
  if (value.nodes.rows.length === 0 || value.edges.rows.length === 0) {
    return fail("blast_radius returned no affected rows");
  }
  return pass(
    `center=${value.center} risk=${value.risk} nodes=${summary.affectedNodes} edges=${summary.affectedEdges}`,
  );
}

function validateEdgeScan(value) {
  const plan = value?.plan;
  const result = value?.result;
  if (plan?.execution?.shouldRun !== true) return fail("match_edges plan did not recommend run");
  if (result?.operation !== "match_edges") return fail("match_edges result missing");
  if (!Array.isArray(result.edges) || result.edges.length === 0) return fail("match_edges returned no rows");
  if (typeof result.totalMatches !== "number" || result.totalMatches < result.edges.length) {
    return fail("match_edges totalMatches contract invalid");
  }
  const followUp = result.followUp;
  if (!followUp?.focusEdge || typeof followUp.focusEdge !== "object") {
    return fail("match_edges followUp.focusEdge missing");
  }
  if (!Array.isArray(followUp.calls) || followUp.calls.length === 0) {
    return fail("match_edges followUp.calls missing");
  }
  if (
    !Array.isArray(followUp.cliFallbackCommands) ||
    followUp.cliFallbackCommands.length === 0
  ) {
    return fail("match_edges followUp.cliFallbackCommands missing");
  }
  return pass(
    `totalMatches=${result.totalMatches} limited=${Boolean(result.limited)} followUp=${followUp.calls.length}`,
  );
}

function validateRelationNameParity(value) {
  const plan = value?.plan;
  const result = value?.result;
  if (plan?.execution?.shouldRun !== true) return fail("relation-name parity plan did not recommend run");
  const normalizedRelationTypes = plan?.normalized?.relationTypes;
  if (!Array.isArray(normalizedRelationTypes) || !normalizedRelationTypes.includes("depends_on")) {
    return fail("query_plan did not preserve public depends_on relation name");
  }
  if (!Array.isArray(plan?.normalized?.types) || !plan.normalized.types.includes("dependencies")) {
    return fail("query_plan did not normalize depends_on to dependencies frontmatter key");
  }
  if (result?.operation !== "match_edges") return fail("relation-name parity match_edges result missing");
  const resultRelationTypes = result?.filters?.relationTypes;
  if (!Array.isArray(resultRelationTypes) || !resultRelationTypes.includes("depends_on")) {
    return fail("match_edges filters did not expose public depends_on relation name");
  }
  if (!Array.isArray(result?.filters?.types) || !result.filters.types.includes("dependencies")) {
    return fail("match_edges filters did not expose dependencies frontmatter key");
  }
  if (!Array.isArray(result.edges) || result.edges.length === 0) {
    return fail("relation-name parity returned no depends_on rows");
  }
  for (const edge of result.edges) {
    if (edge?.relationType !== "depends_on" || edge?.via !== "dependencies") {
      return fail("depends_on row did not round-trip public relation name and frontmatter key");
    }
  }
  const followUp = result.followUp;
  if (followUp?.focusEdge?.relationType !== "depends_on" || followUp.focusEdge?.via !== "dependencies") {
    return fail("relation-name parity followUp focusEdge did not preserve relation names");
  }
  if (
    !Array.isArray(followUp.cliFallbackCommands) ||
    !followUp.cliFallbackCommands.some((command) => command.includes(" relation-check ") && command.includes(" depends_on "))
  ) {
    return fail("relation-name parity relation-check fallback missing public depends_on name");
  }
  return pass(
    `public=depends_on frontmatter=dependencies rows=${result.edges.length} totalMatches=${result.totalMatches}`,
  );
}

function validateFrontmatterEdgeScan(value) {
  const plan = value?.plan;
  const result = value?.result;
  if (plan?.execution?.shouldRun !== true) return fail("frontmatter match_edges plan did not recommend run");
  if (result?.operation !== "match_edges") return fail("frontmatter match_edges result missing");
  if (result?.filters?.fromKind !== "capability") {
    return fail(`frontmatter match_edges fromKind=${result?.filters?.fromKind}`);
  }
  if (result?.filters?.toKind !== "element") {
    return fail(`frontmatter match_edges toKind=${result?.filters?.toKind}`);
  }
  const relationTypes = result?.filters?.relationTypes ?? result?.filters?.types;
  if (!Array.isArray(relationTypes) || !relationTypes.includes("elements")) {
    return fail("frontmatter match_edges relationTypes missing elements");
  }
  if (!Array.isArray(result.edges) || result.edges.length === 0) {
    return fail("frontmatter match_edges returned no elements rows");
  }
  if (typeof result.totalMatches !== "number" || result.totalMatches < result.edges.length) {
    return fail("frontmatter match_edges totalMatches contract invalid");
  }
  const firstEdge = result.edges[0];
  if (firstEdge?.relationType !== "elements" || firstEdge?.via !== "elements") {
    return fail("frontmatter match_edges did not expose elements relation key");
  }
  const followUp = result.followUp;
  if (followUp?.focusEdge?.relationType !== "elements") {
    return fail("frontmatter match_edges followUp relationType missing elements");
  }
  if (!Array.isArray(followUp.calls) || followUp.calls.length === 0) {
    return fail("frontmatter match_edges followUp.calls missing");
  }
  if (
    !Array.isArray(followUp.cliFallbackCommands) ||
    !followUp.cliFallbackCommands.some((command) => command.includes(" relation-check ") && command.includes(" elements "))
  ) {
    return fail("frontmatter match_edges relation-check fallback missing elements");
  }
  return pass(
    `totalMatches=${result.totalMatches} relation=elements followUp=${followUp.calls.length}`,
  );
}

function validateDomainCoupling(value) {
  const summary = value?.summary;
  if (!summary || summary.domains <= 0) return fail("domain matrix summary missing domains");
  if (typeof summary.crossDomainEdges !== "number") return fail("domain matrix crossDomainEdges missing");
  if (!Array.isArray(value?.domains) || value.domains.length === 0) return fail("domain rows missing");
  return pass(`domains=${summary.domains} crossDomainEdges=${summary.crossDomainEdges}`);
}

function validateStructuralTraversal(value) {
  if (value?.operation !== "pattern_walk") return fail("pattern_walk result missing");
  if (value.start !== "project") return fail(`pattern_walk start=${value.start}`);
  if (!Array.isArray(value.pattern) || value.pattern.join(",") !== "domains,capabilities") {
    return fail("pattern_walk pattern did not preserve domains,capabilities");
  }
  const summary = value.summary;
  if (!summary || summary.steps !== 2) return fail("pattern_walk summary steps missing");
  if (typeof summary.matchedPaths !== "number" || summary.matchedPaths <= 0) {
    return fail("pattern_walk matchedPaths missing");
  }
  if (typeof summary.endNodes !== "number" || summary.endNodes <= 0) {
    return fail("pattern_walk endNodes missing");
  }
  if (typeof summary.traversedEdges !== "number" || summary.traversedEdges <= 0) {
    return fail("pattern_walk traversedEdges missing");
  }
  if (!Array.isArray(value.layers) || value.layers.length < 2) {
    return fail("pattern_walk layers missing");
  }
  const relations = value.layers.slice(0, 2).map((layer) => layer?.relation);
  if (relations[0] !== "domains" || relations[1] !== "capabilities") {
    return fail(`pattern_walk layer relations=${relations.join(",")}`);
  }
  for (const layer of value.layers.slice(0, 2)) {
    if (typeof layer?.totalNodes !== "number" || layer.totalNodes <= 0) {
      return fail("pattern_walk layer totalNodes missing");
    }
  }
  if (!value.paths || typeof value.paths.total !== "number" || value.paths.total <= 0) {
    return fail("pattern_walk paths total missing");
  }
  if (!Array.isArray(value.paths.rows) || value.paths.rows.length === 0) {
    return fail("pattern_walk paths rows missing");
  }
  if (!value.edges || typeof value.edges.total !== "number" || value.edges.total <= 0) {
    return fail("pattern_walk edges total missing");
  }
  if (!Array.isArray(value.edges.rows) || value.edges.rows.length === 0) {
    return fail("pattern_walk edges rows missing");
  }
  return pass(
    `pattern=${value.pattern.join("→")} paths=${value.paths.total} endNodes=${summary.endNodes}`,
  );
}

function validateProjectMap(value) {
  if (value?.operation !== "project_map") return fail("project_map result missing");
  if (value.project !== "project") return fail(`project_map project=${value.project}`);
  const summary = value.summary;
  if (!summary || typeof summary !== "object") return fail("project_map summary missing");
  const positiveFields = ["nodes", "domains", "capabilities", "elements", "internalEdges"];
  for (const field of positiveFields) {
    if (typeof summary[field] !== "number" || summary[field] <= 0) {
      return fail(`project_map summary.${field} missing`);
    }
  }
  if (summary.unresolvedEdges !== 0) {
    return fail(`project_map unresolvedEdges=${summary.unresolvedEdges}`);
  }
  if (summary.unassignedNodes !== 0) {
    return fail(`project_map unassignedNodes=${summary.unassignedNodes}`);
  }
  if (!Array.isArray(value.domains) || value.domains.length === 0) {
    return fail("project_map domains rows missing");
  }
  if (!Array.isArray(value.hotspots) || value.hotspots.length === 0) {
    return fail("project_map hotspots missing");
  }
  const firstDomain = value.domains[0];
  const firstDomainSlug = firstDomain?.slug ?? firstDomain?.domain?.slug ?? firstDomain?.node?.slug;
  if (typeof firstDomainSlug !== "string" || !firstDomain?.summary) {
    return fail("project_map domain summary missing");
  }
  if (
    !Array.isArray(firstDomain.capabilities?.nodes) ||
    !Array.isArray(firstDomain.elements?.nodes)
  ) {
    return fail("project_map domain capability/element rows missing");
  }
  return pass(
    `domains=${summary.domains} capabilities=${summary.capabilities} elements=${summary.elements} unresolved=0`,
  );
}

function validatePathEvidence(value) {
  const plan = value?.plan;
  const result = value?.result;
  if (plan?.operation !== "query_plan" || plan.targetOperation !== "all_paths") {
    return fail("all_paths query plan missing");
  }
  if (result?.operation !== "all_paths" || result.found !== true) return fail("all_paths result missing");
  const requiredNumbers = ["limit", "searchBudget", "expandedStates"];
  for (const field of requiredNumbers) {
    if (typeof result[field] !== "number") return fail(`all_paths ${field} missing`);
  }
  const requiredBooleans = ["exhaustive", "truncatedByBudget", "totalPathsExact"];
  for (const field of requiredBooleans) {
    if (typeof result[field] !== "boolean") return fail(`all_paths ${field} missing`);
  }
  if (!result.evidence || typeof result.evidence !== "object") {
    return fail("all_paths evidence contract missing");
  }
  if (typeof result.evidence.status !== "string") return fail("all_paths evidence.status missing");
  if (typeof result.evidence.reason !== "string") return fail("all_paths evidence.reason missing");
  if (typeof result.evidence.pathsComplete !== "boolean") {
    return fail("all_paths evidence.pathsComplete missing");
  }
  return pass(
    `found=true evidence=${result.evidence.status}/${result.evidence.reason} pathsComplete=${result.evidence.pathsComplete} expanded=${result.expandedStates}`,
  );
}

function validateRelationPreflight(value) {
  if (value?.operation !== "relation_check") return fail("relation_check result missing");
  if (value.from !== DEFAULT_FROM || value.to !== DEFAULT_TO) {
    return fail("relation_check endpoint mismatch");
  }
  if (value.relation !== "dependencies") return fail(`relation_check relation=${value.relation}`);
  if (typeof value.exists !== "boolean") return fail("relation_check exists flag missing");
  if (typeof value.verdict !== "string") return fail("relation_check verdict missing");
  const recommendation = value.recommendation;
  if (!recommendation || typeof recommendation !== "object") {
    return fail("relation_check recommendation missing");
  }
  if (typeof recommendation.decision !== "string") {
    return fail("relation_check recommendation.decision missing");
  }
  if (typeof recommendation.severity !== "string") {
    return fail("relation_check recommendation.severity missing");
  }
  if (!Array.isArray(value.matchingEdges)) return fail("relation_check matchingEdges missing");
  if (!Array.isArray(value.inverseEdges)) return fail("relation_check inverseEdges missing");
  if (value.exists === true && value.matchingEdges.length === 0) {
    return fail("relation_check exists without matchingEdges");
  }
  if (!value.schemaPattern || typeof value.schemaPattern.count !== "number") {
    return fail("relation_check schemaPattern missing");
  }
  if (value.proposedAction !== null && value.proposedAction?.tool !== "add_relation") {
    return fail("relation_check proposedAction contract invalid");
  }
  return pass(
    `decision=${recommendation.decision} exists=${value.exists} matching=${value.matchingEdges.length}`,
  );
}

function validateRelationExplain(value) {
  if (value?.operation !== "explain_relation") return fail("explain_relation result missing");
  if (!value.shortestPath || value.shortestPath.found !== true) {
    return fail("explain_relation shortestPath missing");
  }
  if (!value.direct || typeof value.direct.total !== "number") {
    return fail("explain_relation direct edge summary missing");
  }
  return pass(`verdict=${value.verdict} shortestHops=${value.shortestPath.hopCount}`);
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  process.exitCode = runDogfoodGraphDbPack();
}
