import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  parseJsonOutput,
  runDogfoodGraphDbPack,
} from "./dogfood-graph-db-pack.mjs";

describe("dogfood graph DB pack", () => {
  it("rejects invalid JSON output with the command label", () => {
    const parsed = parseJsonOutput("not-json", "facets");

    assert.equal(parsed.ok, false);
    assert.match(parsed.error, /facets returned invalid JSON/);
  });

  it("runs every graph DB check and prints a final ok summary", () => {
    const stdout = [];
    const stderr = [];
    const payloads = [
      { ok: true, performanceOk: true, failed: 0, commands: Array.from({ length: 25 }, () => ({})) },
      { graph: { nodes: 2, edges: 1, unresolvedEdges: 0 }, nodes: { topByDegree: [{}] } },
      {
        plan: { execution: { shouldRun: true } },
        result: { operation: "match_nodes", totalMatches: 2, limited: false, nodes: [{}, {}] },
      },
      {
        plan: { execution: { shouldRun: true } },
        result: { operation: "match_edges", totalMatches: 1, limited: false, edges: [{}] },
      },
      { summary: { domains: 2, crossDomainEdges: 1 }, domains: [{}] },
      {
        plan: { operation: "query_plan", targetOperation: "all_paths" },
        result: {
          operation: "all_paths",
          found: true,
          totalPathsExact: true,
          evidence: { status: "complete", pathsComplete: true },
        },
      },
      {
        operation: "explain_relation",
        verdict: "direct",
        direct: { total: 1 },
        shortestPath: { found: true, hopCount: 1 },
      },
    ];
    let call = 0;
    const status = runDogfoodGraphDbPack({
      spawn: () => ({ status: 0, stdout: JSON.stringify(payloads[call++]) }),
      stdout: { write: (text) => stdout.push(text) },
      stderr: { write: (text) => stderr.push(text) },
    });

    assert.equal(status, 0);
    assert.equal(stderr.join(""), "");
    assert.equal(call, 7);
    assert.match(stdout.join(""), /\[dogfood:graph-db\] ok · 7 runtime graph DB checks passed/);
  });

  it("fails closed when a result contract is missing", () => {
    const stderr = [];
    const status = runDogfoodGraphDbPack({
      spawn: () => ({ status: 0, stdout: JSON.stringify({ ok: false }) }),
      stdout: { write: () => {} },
      stderr: { write: (text) => stderr.push(text) },
    });

    assert.equal(status, 1);
    assert.match(stderr.join(""), /self_check failed/);
  });
});
