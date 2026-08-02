import { describe, expect, it } from "vitest";
import {
  PROJECT_SOURCE_RECEIPT_VERSION,
  buildProjectGraphHash,
  buildProjectSourceReceipt,
  deriveProjectSourceView,
  deserializeProjectSourceState,
  serializeProjectSourceState,
  type ProjectSourceBinding,
  type ProjectSourceProbe,
} from "./project-source-receipt";

const probe = (overrides: Partial<ProjectSourceProbe> = {}): ProjectSourceProbe => ({
  sourceId: "src_7b9f",
  kind: "git",
  revision: "abc123",
  fingerprint: "git:abc123:clean",
  dirty: false,
  truncated: false,
  files: ["src/index.ts", "src/player.ts"],
  ...overrides,
});

const binding = (overrides: Partial<ProjectSourceBinding> = {}): ProjectSourceBinding => ({
  projectSlug: "music-streaming",
  sourceId: "src_7b9f",
  rootPath: "/private/work/music",
  kind: "git",
  boundAt: "2026-08-02T09:00:00.000Z",
  ...overrides,
});

describe("project source receipt", () => {
  it("builds a deterministic project graph fingerprint without node-count semantics", () => {
    const a = buildProjectGraphHash({
      projectSlug: "music-streaming",
      nodes: [
        { id: "capability:play", kind: "capability", title: "Play", projectIds: ["music-streaming"] },
        { id: "project:music-streaming", kind: "project", title: "Music", projectIds: [] },
      ],
      edges: [{ from: "project:music-streaming", to: "capability:play", type: "contains", projectIds: ["music-streaming"] }],
    });
    const b = buildProjectGraphHash({
      projectSlug: "music-streaming",
      nodes: [
        { id: "project:music-streaming", kind: "project", title: "Music", projectIds: [] },
        { id: "capability:play", kind: "capability", title: "Play", projectIds: ["music-streaming"] },
      ],
      edges: [{ from: "project:music-streaming", to: "capability:play", type: "contains", projectIds: ["music-streaming"] }],
    });
    expect(a).toBe(b);
    expect(a).toMatch(/^project-graph-v1:[a-f0-9]{8}$/);
    expect(a).not.toContain("nodes=");
  });
  it("does not turn an unbound legacy project into a failure or a fake percentage", () => {
    const view = deriveProjectSourceView({
      projectSlug: "music-streaming",
      bindings: [],
      graphHash: "graph-a",
    });

    expect(view).toMatchObject({
      contractVersion: PROJECT_SOURCE_RECEIPT_VERSION,
      projectSlug: "music-streaming",
      status: "not_measured",
      measuredAt: null,
      topGap: { id: "source_unbound" },
      nextAction: { id: "connect_source" },
      bindingCardinality: 0,
    });
    expect(JSON.stringify(view)).not.toMatch(/confidence|percent|score|\/\d+/i);
  });

  it("fails closed when a project has more than one active source binding", () => {
    const view = deriveProjectSourceView({
      projectSlug: "music-streaming",
      bindings: [binding(), binding({ sourceId: "src_other", rootPath: "/private/work/other" })],
      graphHash: "graph-a",
    });

    expect(view).toMatchObject({
      status: "invalid",
      topGap: { id: "multiple_active_sources" },
      nextAction: { id: "repair_source_binding" },
      bindingCardinality: 2,
    });
  });

  it("requires current source-role witnesses before verified_current", () => {
    const receipt = buildProjectSourceReceipt({
      projectSlug: "music-streaming",
      graphHash: "graph-a",
      probe: probe(),
      witnesses: [],
      measuredAt: "2026-08-02T10:00:00.000Z",
    });

    expect(receipt).toMatchObject({
      status: "needs_evidence",
      topGap: { id: "source_role_evidence_missing" },
      nextAction: { id: "record_source_role" },
      witnessSummary: { total: 0, supported: 0, missing: 0 },
    });
  });

  it("marks a missing declared implementation path for review", () => {
    const receipt = buildProjectSourceReceipt({
      projectSlug: "music-streaming",
      graphHash: "graph-a",
      probe: probe(),
      witnesses: [{ id: "player-entry", nodeSlug: "player", role: "entrypoint", path: "src/missing.ts" }],
      measuredAt: "2026-08-02T10:00:00.000Z",
    });

    expect(receipt).toMatchObject({
      status: "review_required",
      topGap: { id: "declared_source_path_missing", nodeSlug: "player" },
      nextAction: { id: "repair_source_path", target: "player" },
      witnessSummary: { total: 1, supported: 0, missing: 1 },
    });
  });

  it("verifies only when every declared role path is present in a non-truncated probe", () => {
    const receipt = buildProjectSourceReceipt({
      projectSlug: "music-streaming",
      graphHash: "graph-a",
      probe: probe(),
      witnesses: [
        { id: "player-entry", nodeSlug: "player", role: "entrypoint", path: "src/player.ts" },
        { id: "service-entry", nodeSlug: "service", role: "implementation", path: "src/index.ts" },
      ],
      measuredAt: "2026-08-02T10:00:00.000Z",
    });

    expect(receipt).toMatchObject({
      status: "verified_current",
      topGap: null,
      nextAction: { id: "use_current_evidence" },
      witnessSummary: { total: 2, supported: 2, missing: 0 },
    });
  });

  it("downgrades a saved receipt when the graph changed and degrades honestly without a live probe", () => {
    const receipt = buildProjectSourceReceipt({
      projectSlug: "music-streaming",
      graphHash: "graph-a",
      probe: probe(),
      witnesses: [{ id: "player-entry", nodeSlug: "player", role: "entrypoint", path: "src/player.ts" }],
      measuredAt: "2026-08-02T10:00:00.000Z",
    });
    const stale = deriveProjectSourceView({
      projectSlug: "music-streaming",
      bindings: [binding({ receipt })],
      graphHash: "graph-b",
      probe: probe(),
    });
    const unavailable = deriveProjectSourceView({
      projectSlug: "music-streaming",
      bindings: [binding({ receipt })],
      graphHash: "graph-a",
    });

    expect(stale).toMatchObject({ status: "review_required", currentness: "stale", topGap: { id: "ontology_changed" } });
    expect(unavailable).toMatchObject({ status: "verified_current", currentness: "unavailable" });
  });

  it("keeps private roots in the local binding envelope and out of the shared receipt", () => {
    const receipt = buildProjectSourceReceipt({
      projectSlug: "music-streaming",
      graphHash: "graph-a",
      probe: probe(),
      witnesses: [{ id: "player-entry", nodeSlug: "player", role: "entrypoint", path: "src/player.ts" }],
      measuredAt: "2026-08-02T10:00:00.000Z",
    });
    const text = serializeProjectSourceState({ bindings: [binding({ receipt })] });
    const restored = deserializeProjectSourceState(text);

    expect(text).toContain("/private/work/music");
    expect(JSON.stringify(receipt)).not.toContain("/private/work/music");
    expect(restored.bindings).toHaveLength(1);
    expect(restored.bindings[0]?.receipt).toEqual(receipt);
  });

  it("rejects malformed sidecars instead of silently inventing a clean state", () => {
    const restored = deserializeProjectSourceState('{"contractVersion":1,"bindings":"oops"}');
    expect(restored).toEqual({ contractVersion: PROJECT_SOURCE_RECEIPT_VERSION, bindings: [], malformed: true });
  });
});
