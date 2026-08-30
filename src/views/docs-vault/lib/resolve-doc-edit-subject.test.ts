import { describe, expect, it } from "vitest";
import type { AgentActivityStatus } from "@/entities/vault-session";
import { hasDocMtimeConflict, resolveDocLastEditSubject } from "./resolve-doc-edit-subject";

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

function freshHeartbeatStatus(overrides: {
  updatedAt: string;
  ontologySlug?: string | null;
  files?: string[];
}): AgentActivityStatus {
  return {
    ...emptyStatus(),
    exists: true,
    valid: true,
    stale: false,
    ageMs: 1000,
    heartbeat: {
      agent: "claude-code",
      state: "editing",
      focus: {
        summary: "working",
        ontologySlug: overrides.ontologySlug ?? null,
        files: overrides.files ?? [],
      },
      plan: [],
      evidence: { mcp: [], source: [], codegraph: [], verification: [] },
      updatedAt: overrides.updatedAt,
    },
  };
}

describe("resolveDocLastEditSubject", () => {
  const doc = { slug: "capabilities/foo", path: "docs/ontology/capabilities/foo.md" };

  it("returns null when there is no heartbeat and no self-edit record", () => {
    expect(
      resolveDocLastEditSubject({
        doc,
        agentActivityStatus: emptyStatus(),
        selfEditTimestamps: new Map(),
      }),
    ).toBeNull();
  });

  it("returns agent when a fresh heartbeat's ontologySlug matches the doc slug", () => {
    const status = freshHeartbeatStatus({
      updatedAt: "2026-07-24T12:00:00.000Z",
      ontologySlug: "capabilities/foo",
    });
    const result = resolveDocLastEditSubject({ doc, agentActivityStatus: status, selfEditTimestamps: new Map() });
    expect(result?.kind).toBe("agent");
    expect(result?.atMs).toBe(Date.parse("2026-07-24T12:00:00.000Z"));
  });

  it("returns agent via bare-slug suffix match (folder-prefixed vs bare)", () => {
    const status = freshHeartbeatStatus({ updatedAt: "2026-07-24T12:00:00.000Z", ontologySlug: "foo" });
    const result = resolveDocLastEditSubject({ doc, agentActivityStatus: status, selfEditTimestamps: new Map() });
    expect(result?.kind).toBe("agent");
  });

  it("returns agent when focus.files includes the doc path", () => {
    const status = freshHeartbeatStatus({
      updatedAt: "2026-07-24T12:00:00.000Z",
      files: ["docs/ontology/capabilities/foo.md"],
    });
    const result = resolveDocLastEditSubject({ doc, agentActivityStatus: status, selfEditTimestamps: new Map() });
    expect(result?.kind).toBe("agent");
  });

  it("ignores a heartbeat that does not name this doc", () => {
    const status = freshHeartbeatStatus({
      updatedAt: "2026-07-24T12:00:00.000Z",
      ontologySlug: "capabilities/other",
    });
    expect(
      resolveDocLastEditSubject({ doc, agentActivityStatus: status, selfEditTimestamps: new Map() }),
    ).toBeNull();
  });

  it("ignores a stale heartbeat even if it names this doc", () => {
    const status: AgentActivityStatus = {
      ...freshHeartbeatStatus({ updatedAt: "2026-07-24T12:00:00.000Z", ontologySlug: "capabilities/foo" }),
      stale: true,
    };
    expect(
      resolveDocLastEditSubject({ doc, agentActivityStatus: status, selfEditTimestamps: new Map() }),
    ).toBeNull();
  });

  it("returns human when this session self-wrote this exact slug", () => {
    const selfEditTimestamps = new Map([["capabilities/foo", 500]]);
    const result = resolveDocLastEditSubject({
      doc,
      agentActivityStatus: emptyStatus(),
      selfEditTimestamps,
    });
    expect(result).toEqual({ kind: "human", atMs: 500 });
  });

  it("prefers whichever of agent/human is more recent", () => {
    const status = freshHeartbeatStatus({
      updatedAt: new Date(1000).toISOString(),
      ontologySlug: "capabilities/foo",
    });
    const selfEditTimestamps = new Map([["capabilities/foo", 5000]]);
    const result = resolveDocLastEditSubject({ doc, agentActivityStatus: status, selfEditTimestamps });
    expect(result?.kind).toBe("human");
  });
});

describe("hasDocMtimeConflict", () => {
  const doc = { slug: "capabilities/foo", mtime: 2000 };

  it("is false when mtime has not changed since baseline", () => {
    expect(
      hasDocMtimeConflict({
        doc,
        baselineMtime: 2000,
        baselineCapturedAtMs: 0,
        selfEditTimestamps: new Map(),
      }),
    ).toBe(false);
  });

  it("is true when mtime changed and no self-edit record explains it (real external change)", () => {
    expect(
      hasDocMtimeConflict({
        doc,
        baselineMtime: 1000,
        baselineCapturedAtMs: 0,
        selfEditTimestamps: new Map(),
      }),
    ).toBe(true);
  });

  it("is false when the change is explained by this session's own save", () => {
    expect(
      hasDocMtimeConflict({
        doc,
        baselineMtime: 1000,
        baselineCapturedAtMs: 50,
        selfEditTimestamps: new Map([["capabilities/foo", 100]]),
      }),
    ).toBe(false);
  });
});
