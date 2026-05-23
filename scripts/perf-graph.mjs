#!/usr/bin/env node
// Graph-engine scale audit for compile_ontology + query_ontology hot paths.
//
// This is intentionally in-process: it measures the compiler and graph query
// engine without Codex/Claude process startup, MCP JSON-RPC transport, or file
// system noise. Use it before deciding whether a native helper (for example Go)
// is justified.
//
// Usage:
//   node scripts/perf-graph.mjs
//   node scripts/perf-graph.mjs --n=5000
//   node scripts/perf-graph.mjs --sizes=1000,5000
//   node scripts/perf-graph.mjs --check --runs=5
//   node scripts/perf-graph.mjs --json

import { performance } from "node:perf_hooks";

import { compileOntology } from "../mcp/src/ontology-compiler.mjs";
import { queryCompiledOntology } from "../mcp/src/ontology-engine.mjs";

const args = process.argv.slice(2).filter((arg) => arg !== "--");
const json = args.includes("--json");
const check = args.includes("--check");
const sizeArg = args.find((arg) => arg.startsWith("--n="));
const sizesArg = args.find((arg) => arg.startsWith("--sizes="));
const runsArg = args.find((arg) => arg.startsWith("--runs="));
const maxCompileArg = args.find((arg) => arg.startsWith("--max-compile-ms="));
const maxQueryArg = args.find((arg) => arg.startsWith("--max-query-ms="));
const sizes = parseSizes({ sizeArg, sizesArg, check });
const runs = runsArg ? Number(runsArg.slice(7)) : check ? 3 : 1;
const budgets = {
  compileMs: maxCompileArg ? Number(maxCompileArg.slice(17)) : 750,
  queryMs: maxQueryArg ? Number(maxQueryArg.slice(15)) : 750,
};

if (!Number.isFinite(budgets.compileMs) || budgets.compileMs <= 0) {
  console.error("[perf-graph] --max-compile-ms must be a positive number");
  process.exit(2);
}
if (!Number.isFinite(budgets.queryMs) || budgets.queryMs <= 0) {
  console.error("[perf-graph] --max-query-ms must be a positive number");
  process.exit(2);
}
if (!Number.isInteger(runs) || runs < 1 || runs > 20) {
  console.error("[perf-graph] --runs must be an integer between 1 and 20");
  process.exit(2);
}

function parseSizes({ sizeArg, sizesArg, check }) {
  if (sizeArg && sizesArg) {
    console.error("[perf-graph] use either --n or --sizes, not both");
    process.exit(2);
  }
  if (sizeArg) {
    return [parseSize(sizeArg.slice(4), "--n")];
  }
  if (sizesArg) {
    const rawSizes = sizesArg.slice(8).split(",");
    const parsed = rawSizes.map((value) => parseSize(value, "--sizes"));
    return [...new Set(parsed)].sort((a, b) => a - b);
  }
  return check ? [1000] : [100, 500, 1000, 2000];
}

function parseSize(value, flag) {
  const trimmed = value.trim();
  const size = Number(trimmed);
  if (!Number.isInteger(size) || size < 20) {
    console.error(`[perf-graph] ${flag} values must be integers >= 20`);
    process.exit(2);
  }
  return size;
}

function doc(slug, frontmatter, mtime = 1) {
  return { slug, frontmatter: { slug, ...frontmatter }, body: "", mtime };
}

function generateDocs(n) {
  const docs = [
    doc("project/perf-workbench", {
      kind: "project",
      title: "Perf Workbench",
      domains: Array.from({ length: 6 }, (_, index) => `domains/domain-${index}`),
    }),
  ];
  const domains = 6;
  const capabilityCount = Math.max(1, Math.floor((n - 1) * 0.72));
  const elementCount = Math.max(1, n - 1 - domains - capabilityCount);

  for (let index = 0; index < domains; index += 1) {
    const caps = [];
    for (let cap = index; cap < capabilityCount; cap += domains) {
      caps.push(`capabilities/cap-${cap}`);
    }
    docs.push(
      doc(`domains/domain-${index}`, {
        kind: "domain",
        title: `Domain ${index}`,
        capabilities: caps,
      }),
    );
  }

  for (let index = 0; index < capabilityCount; index += 1) {
    const domain = `domains/domain-${index % domains}`;
    const elements = [`elements/element-${index % elementCount}`];
    const frontmatter = {
      kind: "capability",
      title: `Capability ${index}`,
      domain,
      elements,
    };
    if (index > 0) frontmatter.depends_on = [`capabilities/cap-${index - 1}`];
    if (index > domains) frontmatter.relates = [`capabilities/cap-${index - domains}`];
    docs.push(doc(`capabilities/cap-${index}`, frontmatter));
  }

  for (let index = 0; index < elementCount; index += 1) {
    docs.push(
      doc(`elements/element-${index}`, {
        kind: "element",
        title: `Element ${index}`,
        domain: `domains/domain-${index % domains}`,
      }),
    );
  }

  return docs.slice(0, n);
}

function measure(label, fn) {
  const start = performance.now();
  const value = fn();
  return { label, ms: performance.now() - start, value };
}

function round(ms) {
  return Number(ms.toFixed(2));
}

function runScaleOnce(docs) {
  const compileFull = measure("compile_full", () => compileOntology(docs));
  const compileIndexes = measure("compile_indexes", () => compileOntology(docs, { includeIndexes: true }));
  const compileSummary = measure("compile_summary", () => compileOntology(docs, { summary: true }));
  const artifact = compileIndexes.value;
  const center = "capabilities/cap-10";
  const peer = "capabilities/cap-20";
  const project = "project/perf-workbench";

  const queryInputs = [
    { label: "agent_brief", query: { operation: "agent_brief" } },
    { label: "workspace_brief", query: { operation: "workspace_brief" } },
    { label: "health", query: { operation: "health" } },
    {
      label: "query_plan_blast_radius",
      query: { operation: "query_plan", targetOperation: "blast_radius", slug: center, depth: 2 },
    },
    {
      label: "query_plan_all_paths",
      query: {
        operation: "query_plan",
        targetOperation: "all_paths",
        from: center,
        to: peer,
        maxHops: 3,
        types: ["depends_on", "relates"],
        searchBudget: 1000,
        limit: 10,
      },
    },
    { label: "node_profile", query: { operation: "node_profile", slug: center, depth: 2, limit: 12 } },
    { label: "path", query: { operation: "path", from: center, to: project, maxHops: 5 } },
    {
      label: "all_paths",
      query: {
        operation: "all_paths",
        from: center,
        to: peer,
        maxHops: 3,
        types: ["depends_on", "relates"],
        searchBudget: 1000,
        limit: 10,
      },
    },
    {
      label: "pattern_walk",
      query: {
        operation: "pattern_walk",
        slug: project,
        pattern: ["domains", "capabilities"],
        direction: "outgoing",
        limit: 20,
      },
    },
    { label: "schema", query: { operation: "schema", limit: 20 } },
    {
      label: "relation_check",
      query: { operation: "relation_check", from: center, to: project, type: "depends_on" },
    },
    { label: "blast_radius", query: { operation: "blast_radius", slug: center, depth: 2 } },
    { label: "domain_matrix", query: { operation: "domain_matrix" } },
    { label: "centrality", query: { operation: "centrality", limit: 10, iterations: 12 } },
    { label: "project_map", query: { operation: "project_map", project, itemLimit: 20 } },
  ].map(({ label, query }) =>
    measure(label, () => queryCompiledOntology(artifact, query)),
  );

  return {
    graph: {
      nodes: artifact.nodeCount,
      edges: artifact.edgeCount,
      resolvedEdges: artifact.resolvedEdgeCount,
      graphHash: artifact.graphHash,
    },
    compile: {
      fullMs: round(compileFull.ms),
      indexesMs: round(compileIndexes.ms),
      summaryMs: round(compileSummary.ms),
    },
    queries: Object.fromEntries(queryInputs.map((row) => [row.label, round(row.ms)])),
    queryDiagnostics: {
      query_plan_all_paths: queryPlanDiagnostics(
        queryInputs.find((row) => row.label === "query_plan_all_paths")?.value,
      ),
      all_paths: allPathsDiagnostics(queryInputs.find((row) => row.label === "all_paths")?.value),
    },
  };
}

function queryPlanDiagnostics(value) {
  return {
    targetOperation: value?.targetOperation ?? null,
    strategy: value?.estimate?.strategy ?? null,
    costClass: value?.estimate?.costClass ?? null,
    shouldRun: value?.execution?.shouldRun ?? null,
    nextStep: value?.execution?.nextStep ?? null,
    suggestedOperation: value?.execution?.suggestedQuery?.operation ?? null,
    saferOperation: value?.execution?.saferQuery?.operation ?? null,
  };
}

function allPathsDiagnostics(value) {
  return {
    searchBudget: value?.searchBudget ?? null,
    expandedStates: value?.expandedStates ?? null,
    exhaustive: value?.exhaustive ?? null,
    truncatedByBudget: value?.truncatedByBudget ?? null,
    totalPaths: value?.totalPaths ?? null,
    totalPathsExact: value?.totalPathsExact ?? null,
    limited: value?.limited ?? null,
    evidenceStatus: value?.evidence?.status ?? null,
    evidenceReason: value?.evidence?.reason ?? null,
    pathsComplete: value?.evidence?.pathsComplete ?? null,
  };
}

function summarize(samples) {
  const sorted = [...samples].sort((a, b) => a - b);
  const medianIndex = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 0 ? (sorted[medianIndex - 1] + sorted[medianIndex]) / 2 : sorted[medianIndex];
  return {
    min: round(sorted[0]),
    median: round(median),
    max: round(sorted[sorted.length - 1]),
  };
}

function aggregateMetric(rows, section, metric) {
  return summarize(rows.map((row) => row[section][metric]));
}

function runScale(n) {
  const docs = generateDocs(n);
  const rows = Array.from({ length: runs }, () => runScaleOnce(docs));
  const first = rows[0];
  const compileStats = Object.fromEntries(
    Object.keys(first.compile).map((metric) => [metric, aggregateMetric(rows, "compile", metric)]),
  );
  const queryStats = Object.fromEntries(
    Object.keys(first.queries).map((metric) => [metric, aggregateMetric(rows, "queries", metric)]),
  );

  return {
    n,
    runs,
    graph: first.graph,
    compile: Object.fromEntries(Object.entries(compileStats).map(([metric, stats]) => [metric, stats.median])),
    queries: Object.fromEntries(Object.entries(queryStats).map(([metric, stats]) => [metric, stats.median])),
    queryDiagnostics: first.queryDiagnostics,
    stats: {
      compile: compileStats,
      queries: queryStats,
    },
  };
}

const results = sizes.map(runScale);
const failures = check ? collectBudgetFailures(results, budgets) : [];

if (json) {
  console.log(JSON.stringify({ check, budgets, failures, results }, null, 2));
} else {
  console.log("[perf-graph] compile_ontology + query_ontology in-process scale audit");
  console.log(`[perf-graph] runs per size: ${runs} (reported values are medians)`);
  if (check) {
    console.log(
      `[perf-graph] budgets: compile <= ${budgets.compileMs}ms, each query <= ${budgets.queryMs}ms`,
    );
  }
  console.log("   N   edges  compile  indexes  summary  agent  workspace  health  plan  pathplan  profile   path allpaths pattern schema  relchk  blast  matrix  centrality  project_map");
  for (const result of results) {
    const row = [
      String(result.n).padStart(4),
      String(result.graph.edges).padStart(7),
      result.compile.fullMs.toFixed(2).padStart(8),
      result.compile.indexesMs.toFixed(2).padStart(8),
      result.compile.summaryMs.toFixed(2).padStart(8),
      result.queries.agent_brief.toFixed(2).padStart(6),
      result.queries.workspace_brief.toFixed(2).padStart(9),
      result.queries.health.toFixed(2).padStart(7),
      result.queries.query_plan_blast_radius.toFixed(2).padStart(6),
      result.queries.query_plan_all_paths.toFixed(2).padStart(8),
      result.queries.node_profile.toFixed(2).padStart(8),
      result.queries.path.toFixed(2).padStart(6),
      result.queries.all_paths.toFixed(2).padStart(8),
      result.queries.pattern_walk.toFixed(2).padStart(7),
      result.queries.schema.toFixed(2).padStart(6),
      result.queries.relation_check.toFixed(2).padStart(7),
      result.queries.blast_radius.toFixed(2).padStart(7),
      result.queries.domain_matrix.toFixed(2).padStart(7),
      result.queries.centrality.toFixed(2).padStart(10),
      result.queries.project_map.toFixed(2).padStart(11),
    ];
    console.log(row.join(" "));
    const allPathsPlan = result.queryDiagnostics.query_plan_all_paths;
    console.log(
      `[perf-graph] ${result.n} nodes query_plan(all_paths): ${allPathsPlan.strategy}/${allPathsPlan.costClass}, nextStep: ${allPathsPlan.nextStep}, shouldRun: ${allPathsPlan.shouldRun}, suggested: ${allPathsPlan.suggestedOperation}, safer: ${allPathsPlan.saferOperation ?? "none"}`,
    );
    const allPaths = result.queryDiagnostics.all_paths;
    console.log(
      `[perf-graph] ${result.n} nodes all_paths budget: ${allPaths.searchBudget}, expanded: ${allPaths.expandedStates}, exhaustive: ${allPaths.exhaustive}, totalPathsExact: ${allPaths.totalPathsExact}, evidence: ${allPaths.evidenceStatus}/${allPaths.evidenceReason}, pathsComplete: ${allPaths.pathsComplete}`,
    );
  }
}

if (failures.length > 0) {
  for (const failure of failures) {
    console.error(
      `[perf-graph] ${failure.n} nodes ${failure.metric} ${failure.ms}ms exceeded ${failure.budgetMs}ms`,
    );
  }
  process.exit(1);
}
if (check && !json) {
  console.log("[perf-graph] OK: graph compile/query hot paths are within budget");
}

function collectBudgetFailures(rows, limits) {
  const failures = [];
  for (const row of rows) {
    for (const [metric, ms] of Object.entries(row.compile)) {
      if (ms > limits.compileMs) {
        failures.push({ n: row.n, metric: `compile.${metric}`, ms, budgetMs: limits.compileMs });
      }
    }
    for (const [metric, ms] of Object.entries(row.queries)) {
      if (ms > limits.queryMs) {
        failures.push({ n: row.n, metric: `queries.${metric}`, ms, budgetMs: limits.queryMs });
      }
    }
  }
  return failures;
}
