#!/usr/bin/env node
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  evaluateDogfoodGate,
  expectedResponseIds,
  missingResponseLabels,
  parseDogfoodTimeoutMs,
  parseRpcResponses,
  recordResult,
  rpcTimeoutFailure,
  shouldFinishRpc,
} from "./dogfood-mcp-walk.mjs";

const okShape = {
  kinds: { total: 1, byKind: { project: 1 } },
  list: { total: 1, nodes: [] },
  ev: { matches: [] },
  path: { found: true, hopCount: 1, hops: ["a", "b"] },
  bl: { total: 1, matches: [] },
  orph: { total: 0, orphans: [] },
  validation: {
    scanned: 1,
    problems: [],
    summary: { problemFiles: 0, errorFiles: 0, warningFiles: 0 },
  },
  brief: { status: "healthy", summary: { nodes: 1, edges: 0, issues: 0 }, nextActions: [] },
  health: { status: "healthy", summary: { issues: 0 }, checks: [] },
};

describe("recordResult", () => {
  it("records missing, error, and non-JSON responses", () => {
    const failures = [];
    assert.equal(recordResult(failures, "missing", null), false);
    assert.equal(recordResult(failures, "error", { error: { message: "bad" } }), false);
    assert.equal(recordResult(failures, "raw", { rawText: "not json" }), false);
    assert.deepEqual(failures, [
      "missing: missing response",
      "error: bad",
      "raw: non-JSON response",
    ]);
  });

  it("passes parsed JSON result objects", () => {
    const failures = [];
    assert.equal(recordResult(failures, "ok", { total: 1 }), true);
    assert.deepEqual(failures, []);
  });
});

describe("rpc response completion helpers", () => {
  it("parses dogfood timeout env as a strict positive integer", () => {
    assert.equal(parseDogfoodTimeoutMs(undefined), 5000);
    assert.equal(parseDogfoodTimeoutMs(""), 5000);
    assert.equal(parseDogfoodTimeoutMs("12000"), 12000);
    assert.equal(parseDogfoodTimeoutMs("1000ms"), false);
    assert.equal(parseDogfoodTimeoutMs("0"), false);
  });

  it("derives response ids from requests with JSON-RPC ids", () => {
    assert.deepEqual(
      [...expectedResponseIds([{ id: 1 }, { method: "notifications/initialized" }, { id: 2 }])],
      [1, 2],
    );
  });

  it("parses newline-delimited JSON-RPC responses", () => {
    assert.deepEqual(
      parseRpcResponses('{"id":1,"result":{}}\nnot-json\n{"id":2,"error":{"message":"bad"}}\n'),
      [
        { id: 1, result: {} },
        { id: 2, error: { message: "bad" } },
      ],
    );
  });

  it("finishes after all expected responses or any error response", () => {
    const expectedIds = new Set([1, 2]);
    assert.equal(shouldFinishRpc('{"id":1,"result":{}}\n', expectedIds), false);
    assert.equal(shouldFinishRpc('{"id":1,"result":{}}\n{"id":2,"result":{}}\n', expectedIds), true);
    assert.equal(shouldFinishRpc('{"id":1,"error":{"message":"bad"}}\n', expectedIds), true);
  });

  it("formats timeout failures with missing response labels", () => {
    const labels = new Map([
      [1, "initialize"],
      [2, "list_kinds"],
      [3, "list_concepts"],
    ]);
    const missing = missingResponseLabels([{ id: 1, result: {} }], labels);
    assert.deepEqual(missing, ["list_kinds", "list_concepts"]);
    assert.equal(
      rpcTimeoutFailure(5000, missing),
      "rpc: timed out after 5000ms waiting for list_kinds, list_concepts",
    );
  });
});

describe("evaluateDogfoodGate", () => {
  it("passes the healthy dogfood shape", () => {
    assert.deepEqual(evaluateDogfoodGate(okShape), []);
  });

  it("fails on vault warnings", () => {
    const failures = evaluateDogfoodGate({
      ...okShape,
      list: { ...okShape.list, vaultWarnings: { errorCount: 0, warningCount: 1 } },
    });
    assert.deepEqual(failures, ["list_concepts: vaultWarnings present"]);
  });

  it("fails on validate_vault problem files", () => {
    const failures = evaluateDogfoodGate({
      ...okShape,
      validation: {
        scanned: 2,
        problems: [{ slug: "broken", issues: [{ code: "missing-kind", severity: "error" }] }],
        summary: { problemFiles: 1, errorFiles: 1, warningFiles: 0 },
      },
    });
    assert.deepEqual(failures, [
      "validate_vault: problemFiles 1 (errors 1, warnings 0)",
    ]);
  });

  it("fails on missing graph path", () => {
    const failures = evaluateDogfoodGate({
      ...okShape,
      path: { found: false, reason: "not connected" },
    });
    assert.deepEqual(failures, ["find_path: expected mcp-server → vault-local-first path"]);
  });

  it("fails on unhealthy first-contact diagnosis", () => {
    const failures = evaluateDogfoodGate({
      ...okShape,
      brief: { ...okShape.brief, status: "needs_attention" },
      health: { ...okShape.health, status: "needs_attention" },
    });
    assert.deepEqual(failures, [
      "workspace_brief: status needs_attention",
      "health: status needs_attention",
    ]);
  });

  it("fails on failing health checks even when top-level status is healthy", () => {
    const failures = evaluateDogfoodGate({
      ...okShape,
      brief: {
        ...okShape.brief,
        health: { checks: [{ id: "dependency_cycles", status: "fail" }] },
      },
      health: {
        ...okShape.health,
        checks: [{ id: "compile_issues", status: "fail" }],
      },
    });
    assert.deepEqual(failures, [
      "workspace_brief: failing health checks dependency_cycles",
      "health: failing health checks compile_issues",
    ]);
  });

  it("fails when workspace brief leaves warn/fail next actions", () => {
    const failures = evaluateDogfoodGate({
      ...okShape,
      brief: {
        ...okShape.brief,
        nextActions: [
          { kind: "health_check", severity: "info", id: "components" },
          { kind: "materialize_external_elements", severity: "warn", count: 2 },
          { kind: "resolve_dangling_references", severity: "fail", count: 1 },
        ],
      },
    });
    assert.deepEqual(failures, [
      "workspace_brief: actionable nextActions materialize_external_elements, resolve_dangling_references",
    ]);
  });
});
