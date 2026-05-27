#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_VAULT = "docs/ontology";
const DEFAULT_FROM = "capabilities/cli-developer-entry";
const DEFAULT_TO = "capabilities/mcp-server";

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

function validateDomainCoupling(value) {
  const summary = value?.summary;
  if (!summary || summary.domains <= 0) return fail("domain matrix summary missing domains");
  if (typeof summary.crossDomainEdges !== "number") return fail("domain matrix crossDomainEdges missing");
  if (!Array.isArray(value?.domains) || value.domains.length === 0) return fail("domain rows missing");
  return pass(`domains=${summary.domains} crossDomainEdges=${summary.crossDomainEdges}`);
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
