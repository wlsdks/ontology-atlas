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
        operation: "health",
        status: "healthy",
        summary: { nodes: 2, edges: 1, unresolvedEdges: 0, issues: 0 },
        checks: [{ id: "compile_issues", status: "pass", count: 0 }],
      },
      {
        plan: { execution: { shouldRun: true } },
        result: {
          operation: "match_nodes",
          totalMatches: 2,
          limited: false,
          nodes: [{}, {}],
          followUp: {
            focusSlug: "capabilities/a",
            calls: [{}],
            cliFallbackCommands: ["oh-my-ontology node capabilities/a [vault]"],
          },
        },
      },
      {
        plan: { execution: { shouldRun: true } },
        result: {
          operation: "match_edges",
          totalMatches: 1,
          limited: false,
          edges: [{}],
          followUp: {
            focusEdge: { from: "a", to: "b", relationType: "depends_on" },
            calls: [{}],
            cliFallbackCommands: ["oh-my-ontology explain a b [vault]"],
          },
        },
      },
      { summary: { domains: 2, crossDomainEdges: 1 }, domains: [{}] },
      {
        plan: { operation: "query_plan", targetOperation: "all_paths" },
        result: {
          operation: "all_paths",
          found: true,
          limit: 10,
          searchBudget: 1000,
          expandedStates: 12,
          exhaustive: true,
          truncatedByBudget: false,
          totalPathsExact: true,
          evidence: { status: "complete", reason: "exhaustive", pathsComplete: true },
        },
      },
      {
        operation: "relation_check",
        from: "capabilities/cli-developer-entry",
        to: "capabilities/mcp-server",
        relation: "dependencies",
        exists: true,
        verdict: "already_exists",
        recommendation: { decision: "skip_existing", severity: "info" },
        matchingEdges: [{}],
        inverseEdges: [],
        schemaPattern: { count: 1 },
        proposedAction: null,
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
    assert.equal(call, 9);
    assert.match(stdout.join(""), /\[dogfood:graph-db\] health_gate: status=healthy checks=1 issues=0 unresolved=0/);
    assert.match(stdout.join(""), /\[dogfood:graph-db\] ok · 9 runtime graph DB checks passed/);
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

  it("fails closed when graph scan follow-up packets are missing", () => {
    const stderr = [];
    const payloads = [
      { ok: true, performanceOk: true, failed: 0, commands: Array.from({ length: 25 }, () => ({})) },
      { graph: { nodes: 2, edges: 1, unresolvedEdges: 0 }, nodes: { topByDegree: [{}] } },
      {
        operation: "health",
        status: "healthy",
        summary: { nodes: 2, edges: 1, unresolvedEdges: 0, issues: 0 },
        checks: [{ id: "compile_issues", status: "pass", count: 0 }],
      },
      {
        plan: { execution: { shouldRun: true } },
        result: { operation: "match_nodes", totalMatches: 1, limited: false, nodes: [{}] },
      },
    ];
    let call = 0;
    const status = runDogfoodGraphDbPack({
      spawn: () => ({ status: 0, stdout: JSON.stringify(payloads[call++]) }),
      stdout: { write: () => {} },
      stderr: { write: (text) => stderr.push(text) },
    });

    assert.equal(status, 1);
    assert.match(stderr.join(""), /match_nodes followUp\.focusSlug missing/);
  });

  it("fails closed when the health gate is not clean", () => {
    const stderr = [];
    const payloads = [
      { ok: true, performanceOk: true, failed: 0, commands: Array.from({ length: 25 }, () => ({})) },
      { graph: { nodes: 2, edges: 1, unresolvedEdges: 0 }, nodes: { topByDegree: [{}] } },
      {
        operation: "health",
        status: "needs_attention",
        summary: { nodes: 2, edges: 1, unresolvedEdges: 1, issues: 0 },
        checks: [{ id: "unresolved_edges", status: "fail", count: 1 }],
      },
    ];
    let call = 0;
    const status = runDogfoodGraphDbPack({
      spawn: () => ({ status: 0, stdout: JSON.stringify(payloads[call++]) }),
      stdout: { write: () => {} },
      stderr: { write: (text) => stderr.push(text) },
    });

    assert.equal(status, 1);
    assert.match(stderr.join(""), /health_gate failed: health status=needs_attention/);
  });

  it("fails closed when health check rows are malformed", () => {
    const stderr = [];
    const payloads = [
      { ok: true, performanceOk: true, failed: 0, commands: Array.from({ length: 25 }, () => ({})) },
      { graph: { nodes: 2, edges: 1, unresolvedEdges: 0 }, nodes: { topByDegree: [{}] } },
      {
        operation: "health",
        status: "healthy",
        summary: { nodes: 2, edges: 1, unresolvedEdges: 0, issues: 0 },
        checks: [{ id: "compile_issues", status: "pass" }],
      },
    ];
    let call = 0;
    const status = runDogfoodGraphDbPack({
      spawn: () => ({ status: 0, stdout: JSON.stringify(payloads[call++]) }),
      stdout: { write: () => {} },
      stderr: { write: (text) => stderr.push(text) },
    });

    assert.equal(status, 1);
    assert.match(stderr.join(""), /health check compile_issues count invalid/);
  });

  it("fails closed when all_paths completeness fields are missing", () => {
    const stderr = [];
    const payloads = [
      { ok: true, performanceOk: true, failed: 0, commands: Array.from({ length: 25 }, () => ({})) },
      { graph: { nodes: 2, edges: 1, unresolvedEdges: 0 }, nodes: { topByDegree: [{}] } },
      {
        operation: "health",
        status: "healthy",
        summary: { nodes: 2, edges: 1, unresolvedEdges: 0, issues: 0 },
        checks: [{ id: "compile_issues", status: "pass", count: 0 }],
      },
      {
        plan: { execution: { shouldRun: true } },
        result: {
          operation: "match_nodes",
          totalMatches: 1,
          limited: false,
          nodes: [{}],
          followUp: { focusSlug: "a", calls: [{}], cliFallbackCommands: ["node a"] },
        },
      },
      {
        plan: { execution: { shouldRun: true } },
        result: {
          operation: "match_edges",
          totalMatches: 1,
          limited: false,
          edges: [{}],
          followUp: {
            focusEdge: { from: "a", to: "b" },
            calls: [{}],
            cliFallbackCommands: ["explain a b"],
          },
        },
      },
      { summary: { domains: 2, crossDomainEdges: 1 }, domains: [{}] },
      {
        plan: { operation: "query_plan", targetOperation: "all_paths" },
        result: {
          operation: "all_paths",
          found: true,
          limit: 10,
          searchBudget: 1000,
          expandedStates: 12,
          exhaustive: true,
          truncatedByBudget: false,
          totalPathsExact: true,
          evidence: { status: "complete", pathsComplete: true },
        },
      },
    ];
    let call = 0;
    const status = runDogfoodGraphDbPack({
      spawn: () => ({ status: 0, stdout: JSON.stringify(payloads[call++]) }),
      stdout: { write: () => {} },
      stderr: { write: (text) => stderr.push(text) },
    });

    assert.equal(status, 1);
    assert.match(stderr.join(""), /all_paths evidence\.reason missing/);
  });

  it("fails closed when relation_check recommendation is missing", () => {
    const stderr = [];
    const payloads = [
      { ok: true, performanceOk: true, failed: 0, commands: Array.from({ length: 25 }, () => ({})) },
      { graph: { nodes: 2, edges: 1, unresolvedEdges: 0 }, nodes: { topByDegree: [{}] } },
      {
        operation: "health",
        status: "healthy",
        summary: { nodes: 2, edges: 1, unresolvedEdges: 0, issues: 0 },
        checks: [{ id: "compile_issues", status: "pass", count: 0 }],
      },
      {
        plan: { execution: { shouldRun: true } },
        result: {
          operation: "match_nodes",
          totalMatches: 1,
          limited: false,
          nodes: [{}],
          followUp: { focusSlug: "a", calls: [{}], cliFallbackCommands: ["node a"] },
        },
      },
      {
        plan: { execution: { shouldRun: true } },
        result: {
          operation: "match_edges",
          totalMatches: 1,
          limited: false,
          edges: [{}],
          followUp: {
            focusEdge: { from: "a", to: "b" },
            calls: [{}],
            cliFallbackCommands: ["explain a b"],
          },
        },
      },
      { summary: { domains: 2, crossDomainEdges: 1 }, domains: [{}] },
      {
        plan: { operation: "query_plan", targetOperation: "all_paths" },
        result: {
          operation: "all_paths",
          found: true,
          limit: 10,
          searchBudget: 1000,
          expandedStates: 12,
          exhaustive: true,
          truncatedByBudget: false,
          totalPathsExact: true,
          evidence: { status: "complete", reason: "exhaustive", pathsComplete: true },
        },
      },
      {
        operation: "relation_check",
        from: "capabilities/cli-developer-entry",
        to: "capabilities/mcp-server",
        relation: "dependencies",
        exists: true,
        verdict: "already_exists",
        matchingEdges: [{}],
        inverseEdges: [],
        schemaPattern: { count: 1 },
        proposedAction: null,
      },
    ];
    let call = 0;
    const status = runDogfoodGraphDbPack({
      spawn: () => ({ status: 0, stdout: JSON.stringify(payloads[call++]) }),
      stdout: { write: () => {} },
      stderr: { write: (text) => stderr.push(text) },
    });

    assert.equal(status, 1);
    assert.match(stderr.join(""), /relation_check recommendation missing/);
  });
});
