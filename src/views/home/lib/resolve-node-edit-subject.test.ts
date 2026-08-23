import { describe, expect, it } from "vitest";
import type { AgentActivityStatus } from "@/features/docs-vault-local";
import { hasNodeMtimeConflict, resolveNodeLastEditSubject } from "./resolve-node-edit-subject";

function emptyStatus(): AgentActivityStatus {
  return {
    sourcePath: ".ontology-atlas/agent-activity.json",
    exists: false,
    valid: false,
    stale: false,
    ageMs: null,
    heartbeat: null,
    reviewMode: "none",
    reviewTarget: { kind: "none", ontologySlug: null, files: [], label: "none" },
    proof: { count: 0, sources: { mcp: 0, source: 0, verification: 0 }, label: "" },
    refreshRequest: {
      required: false,
      reason: null,
      previousAgent: null,
      previousState: null,
      previousFocus: null,
      previousOntologySlug: null,
      previousFiles: [],
      previousAgeMs: null,
      command: null,
      message: null,
    },
    errorMessage: null,
  };
}

function freshHeartbeatStatus(updatedAt: string): AgentActivityStatus {
  return {
    ...emptyStatus(),
    exists: true,
    valid: true,
    stale: false,
    ageMs: 1000,
    heartbeat: {
      agent: "claude-code",
      state: "editing",
      focus: { summary: "working", ontologySlug: "capabilities/foo", files: [] },
      plan: [],
      evidence: { mcp: [], source: [], codegraph: [], verification: [] },
      updatedAt,
    },
  };
}

describe("resolveNodeLastEditSubject", () => {
  it("returns null with no heartbeat and no self-edit record", () => {
    expect(
      resolveNodeLastEditSubject({
        nodeId: "capability:foo",
        sourceSlug: "capabilities/foo",
        agentActivityStatus: emptyStatus(),
        agentFocusNodeId: null,
        selfEditTimestamps: new Map(),
      }),
    ).toBeNull();
  });

  it("returns agent when the fresh heartbeat's resolved focus node matches this node id", () => {
    const status = freshHeartbeatStatus("2026-07-24T12:00:00.000Z");
    const result = resolveNodeLastEditSubject({
      nodeId: "capability:foo",
      sourceSlug: "capabilities/foo",
      agentActivityStatus: status,
      agentFocusNodeId: "capability:foo",
      selfEditTimestamps: new Map(),
    });
    expect(result).toEqual({ kind: "agent", atMs: Date.parse("2026-07-24T12:00:00.000Z") });
  });

  it("ignores the heartbeat when the resolved focus node is a different node", () => {
    const status = freshHeartbeatStatus("2026-07-24T12:00:00.000Z");
    expect(
      resolveNodeLastEditSubject({
        nodeId: "capability:foo",
        sourceSlug: "capabilities/foo",
        agentActivityStatus: status,
        agentFocusNodeId: "capability:bar",
        selfEditTimestamps: new Map(),
      }),
    ).toBeNull();
  });

  it("returns human when the node's source slug has a self-edit record", () => {
    const result = resolveNodeLastEditSubject({
      nodeId: "capability:foo",
      sourceSlug: "capabilities/foo",
      agentActivityStatus: emptyStatus(),
      agentFocusNodeId: null,
      selfEditTimestamps: new Map([["capabilities/foo", 800]]),
    });
    expect(result).toEqual({ kind: "human", atMs: 800 });
  });
});

describe("hasNodeMtimeConflict", () => {
  it("is false when freshness has not changed", () => {
    expect(
      hasNodeMtimeConflict({
        sourceSlug: "capabilities/foo",
        baselineFreshnessIso: "2026-07-24T00:00:00.000Z",
        currentFreshnessIso: "2026-07-24T00:00:00.000Z",
        baselineSelfEditAtMs: null,
        selfEditTimestamps: new Map(),
      }),
    ).toBe(false);
  });

  it("is true when freshness changed with no self-edit record explaining it", () => {
    expect(
      hasNodeMtimeConflict({
        sourceSlug: "capabilities/foo",
        baselineFreshnessIso: "2026-07-24T00:00:00.000Z",
        currentFreshnessIso: "2026-07-24T01:00:00.000Z",
        baselineSelfEditAtMs: null,
        selfEditTimestamps: new Map(),
      }),
    ).toBe(true);
  });

  it("is false when a same-session self-edit explains the change", () => {
    expect(
      hasNodeMtimeConflict({
        sourceSlug: "capabilities/foo",
        baselineFreshnessIso: "2026-07-24T00:00:00.000Z",
        currentFreshnessIso: "2026-07-24T01:00:00.000Z",
        baselineSelfEditAtMs: null,
        selfEditTimestamps: new Map([["capabilities/foo", 100]]),
      }),
    ).toBe(false);
  });

  it("is true when the self-edit record has not advanced since the baseline", () => {
    expect(
      hasNodeMtimeConflict({
        sourceSlug: "capabilities/foo",
        baselineFreshnessIso: "2026-07-24T00:00:00.000Z",
        currentFreshnessIso: "2026-07-24T01:00:00.000Z",
        baselineSelfEditAtMs: 100,
        selfEditTimestamps: new Map([["capabilities/foo", 100]]),
      }),
    ).toBe(true);
  });
});
