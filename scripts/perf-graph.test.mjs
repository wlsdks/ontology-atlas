import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { describe, it } from "node:test";

const SCRIPT = new URL("./perf-graph.mjs", import.meta.url).pathname;

function runPerfGraph(args) {
  return spawnSync(process.execPath, [SCRIPT, ...args], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
}

describe("perf-graph scale audit", () => {
  it("reports agent handoff hot paths in JSON output", () => {
    const result = runPerfGraph(["--json", "--n=100", "--runs=1"]);

    assert.equal(result.status, 0, result.stderr);
    const payload = JSON.parse(result.stdout);
    const [row] = payload.results;

    assert.equal(row.runs, 1);
    assert.equal(row.graph.nodes, 100);
    assert.ok(row.queries.agent_brief > 0);
    assert.ok(row.queries.workspace_brief > 0);
    assert.ok(row.queries.query_plan_all_paths > 0);
    assert.ok(row.queries.query_plan_match_nodes > 0);
    assert.ok(row.queries.query_plan_match_edges > 0);
    assert.ok(row.queries.all_paths > 0);
    assert.ok(row.queries.pattern_walk > 0);
    assert.ok(row.queries.schema > 0);
    assert.ok(row.queries.relation_check > 0);
    assert.ok(row.queries.match_nodes > 0);
    assert.ok(row.queries.match_edges > 0);
    assert.equal(row.queryDiagnostics.query_plan_all_paths.targetOperation, "all_paths");
    assert.equal(row.queryDiagnostics.query_plan_all_paths.strategy, "bounded_path_enumeration");
    assert.match(row.queryDiagnostics.query_plan_all_paths.costClass, /^(low|medium|high)$/);
    assert.equal(typeof row.queryDiagnostics.query_plan_all_paths.shouldRun, "boolean");
    assert.match(row.queryDiagnostics.query_plan_all_paths.nextStep, /^(run|review|narrow)$/);
    assert.equal(row.queryDiagnostics.query_plan_all_paths.suggestedOperation, "all_paths");
    assert.equal(row.queryDiagnostics.query_plan_match_nodes.targetOperation, "match_nodes");
    assert.equal(row.queryDiagnostics.query_plan_match_nodes.strategy, "node_scan");
    assert.equal(row.queryDiagnostics.query_plan_match_nodes.suggestedOperation, "match_nodes");
    assert.equal(typeof row.queryDiagnostics.query_plan_match_nodes.totalMatches, "number");
    assert.equal(row.queryDiagnostics.query_plan_match_edges.targetOperation, "match_edges");
    assert.equal(row.queryDiagnostics.query_plan_match_edges.strategy, "edge_scan");
    assert.equal(row.queryDiagnostics.query_plan_match_edges.suggestedOperation, "match_edges");
    assert.equal(typeof row.queryDiagnostics.query_plan_match_edges.totalMatches, "number");
    assert.equal(row.queryDiagnostics.all_paths.searchBudget, 1000);
    assert.equal(typeof row.queryDiagnostics.all_paths.expandedStates, "number");
    assert.equal(typeof row.queryDiagnostics.all_paths.exhaustive, "boolean");
    assert.match(row.queryDiagnostics.all_paths.evidenceStatus, /^(complete|partial)$/);
    assert.match(row.queryDiagnostics.all_paths.evidenceReason, /^(complete|limit|search_budget)$/);
    assert.equal(typeof row.queryDiagnostics.all_paths.pathsComplete, "boolean");
    assert.ok(row.stats.queries.agent_brief.min > 0);
    assert.ok(row.stats.queries.relation_check.max > 0);
    assert.ok(row.stats.queries.match_nodes.max > 0);
    assert.ok(row.stats.queries.match_edges.max > 0);
  });

  it("measures multiple explicit sizes in JSON output", () => {
    const result = runPerfGraph(["--json", "--sizes=100,200", "--runs=1"]);

    assert.equal(result.status, 0, result.stderr);
    const payload = JSON.parse(result.stdout);

    assert.deepEqual(payload.results.map((row) => row.n), [100, 200]);
    assert.equal(payload.results[0].runs, 1);
    assert.equal(payload.results[1].runs, 1);
  });

  it("prints the agent, graph scan, and relation_check columns in human output", () => {
    const result = runPerfGraph(["--n=100", "--runs=1"]);

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /runs per size: 1 \(reported values are medians\)/);
    assert.match(result.stdout, /agent\s+workspace\s+health\s+plan\s+pathplan\s+nodeplan\s+edgeplan\s+profile\s+path\s+allpaths\s+pattern\s+schema\s+relchk\s+blast/);
    assert.match(result.stdout, /centrality\s+matchnodes\s+matchedges\s+project_map/);
    assert.match(result.stdout, /query_plan\(all_paths\): bounded_path_enumeration\/(low|medium|high), nextStep: (run|review|narrow), shouldRun: (true|false), suggested: all_paths, safer: (all_paths|none)/);
    assert.match(result.stdout, /all_paths budget: 1000, expanded: \d+, exhaustive: (true|false), totalPathsExact: (true|false), evidence: (complete|partial)\/(complete|limit|search_budget), pathsComplete: (true|false)/);
    assert.match(result.stdout, /query_plan\(match_nodes\): node_scan\/(low|medium|high), totalMatches: \d+, nextStep: (run|review|narrow), shouldRun: (true|false)/);
    assert.match(result.stdout, /query_plan\(match_edges\): edge_scan\/(low|medium|high), totalMatches: \d+, nextStep: (run|review|narrow), shouldRun: (true|false)/);
  });

  it("rejects invalid run counts before measuring", () => {
    const result = runPerfGraph(["--runs=0"]);

    assert.equal(result.status, 2);
    assert.match(result.stderr, /--runs must be an integer between 1 and 20/);
    assert.equal(result.stdout, "");
  });

  it("rejects mixing --n and --sizes", () => {
    const result = runPerfGraph(["--n=100", "--sizes=100,200"]);

    assert.equal(result.status, 2);
    assert.match(result.stderr, /use either --n or --sizes, not both/);
    assert.equal(result.stdout, "");
  });

  it("rejects invalid explicit sizes before measuring", () => {
    const result = runPerfGraph(["--sizes=100,nope"]);

    assert.equal(result.status, 2);
    assert.match(result.stderr, /--sizes values must be integers >= 20/);
    assert.equal(result.stdout, "");
  });
});
