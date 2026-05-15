#!/usr/bin/env node
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { evaluateDogfoodGate, recordResult } from "./dogfood-mcp-walk.mjs";

const okShape = {
  kinds: { total: 1, byKind: { project: 1 } },
  list: { total: 1, nodes: [] },
  ev: { matches: [] },
  path: { found: true, hopCount: 1, hops: ["a", "b"] },
  bl: { total: 1, matches: [] },
  orph: { total: 0, orphans: [] },
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
});
