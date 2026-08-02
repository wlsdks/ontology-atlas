import { describe, expect, it } from "vitest";
import {
  PROJECT_SOURCE_RECEIPT_VERSION,
  buildProjectGraphHash,
  buildProjectSourceReceipt,
  deriveProjectSourceView,
  deserializeProjectSourceState,
  formatProjectSourceHandoff,
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
        { id: "capability:play", kind: "capability", projectIds: ["music-streaming"], agentSlug: "capabilities/play" },
        { id: "project:music-streaming", kind: "project", projectIds: [], agentSlug: "music-streaming" },
      ],
      docs: [
        { slug: "music-streaming", frontmatter: { kind: "project", title: "Music", capabilities: ["capabilities/play"] } },
        { slug: "capabilities/play", frontmatter: { kind: "capability", title: "Play", path: "src/play.ts" } },
      ],
    });
    const b = buildProjectGraphHash({
      projectSlug: "music-streaming",
      nodes: [
        { id: "project:music-streaming", kind: "project", projectIds: [], agentSlug: "music-streaming" },
        { id: "capability:play", kind: "capability", projectIds: ["music-streaming"], agentSlug: "capabilities/play" },
      ],
      docs: [
        { slug: "capabilities/play", frontmatter: { path: "./src/play.ts", title: "Play", kind: "capability" } },
        { slug: "music-streaming", frontmatter: { capabilities: ["capabilities/play"], title: "Music", kind: "project" } },
      ],
    });
    expect(a).toBe(b);
    expect(a).toMatch(/^project-graph-v1:[a-f0-9]{8}$/);
    expect(a).not.toContain("nodes=");

    const changedPath = buildProjectGraphHash({
      projectSlug: "music-streaming",
      nodes: [
        { id: "project:music-streaming", kind: "project", projectIds: [], agentSlug: "music-streaming" },
        { id: "capability:play", kind: "capability", projectIds: ["music-streaming"], agentSlug: "capabilities/play" },
      ],
      docs: [
        { slug: "music-streaming", frontmatter: { kind: "project", title: "Music", capabilities: ["capabilities/play"] } },
        { slug: "capabilities/play", frontmatter: { kind: "capability", title: "Play", path: "src/player.ts" } },
      ],
    });
    expect(changedPath).not.toBe(a);
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

  it("treats a declared directory as supported when the inventory contains a descendant file", () => {
    const receipt = buildProjectSourceReceipt({
      projectSlug: "atlas",
      graphHash: "graph-a",
      probe: probe({ files: ["src/features/project-source/index.ts"] }),
      witnesses: [
        {
          id: "project-source:path",
          nodeSlug: "capabilities/project-source",
          role: "entrypoint",
          path: "src/features/project-source",
        },
      ],
    });

    expect(receipt.status).toBe("verified_current");
    expect(receipt.witnesses[0]).toMatchObject({ supported: true });
  });

  it("does not confuse a same-prefix sibling with a declared directory", () => {
    const receipt = buildProjectSourceReceipt({
      projectSlug: "atlas",
      graphHash: "graph-a",
      probe: probe({ files: ["src/features/project-source-old/index.ts"] }),
      witnesses: [
        {
          id: "project-source:path",
          nodeSlug: "capabilities/project-source",
          role: "entrypoint",
          path: "src/features/project-source",
        },
      ],
    });

    expect(receipt.status).toBe("review_required");
    expect(receipt.witnesses[0]).toMatchObject({ supported: false });
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
    const handoff = formatProjectSourceHandoff(deriveProjectSourceView({
      projectSlug: "music-streaming",
      bindings: [binding({ receipt })],
      graphHash: "graph-a",
      probe: probe(),
    }));
    expect(handoff).toContain("sourceKind: git");
    expect(handoff).toContain("status: verified_current");
    expect(handoff).toContain("topGap: none");
    expect(handoff).toContain("nextAction: use_current_evidence");
    expect(handoff).not.toContain("/private/work/music");
  });

  it("rejects malformed sidecars instead of silently inventing a clean state", () => {
    const restored = deserializeProjectSourceState('{"contractVersion":1,"bindings":"oops"}');
    expect(restored).toEqual({ contractVersion: PROJECT_SOURCE_RECEIPT_VERSION, bindings: [], malformed: true });
  });

  it("rejects malformed nested receipts and absolute witness paths like the MCP reader", () => {
    const validReceipt = buildProjectSourceReceipt({
      projectSlug: "music-streaming",
      graphHash: "graph-a",
      probe: probe(),
      witnesses: [{ id: "player", nodeSlug: "player", role: "entrypoint", path: "src/player.ts" }],
    });
    const state = (receipt: unknown) => JSON.stringify({
      contractVersion: 1,
      bindings: [{ ...binding(), receipt }],
    });

    expect(deserializeProjectSourceState(state({
      ...validReceipt,
      witnessSummary: { total: 2, supported: 1, missing: 0 },
    })).malformed).toBe(true);
    expect(deserializeProjectSourceState(state({
      ...validReceipt,
      witnesses: [{ ...validReceipt.witnesses[0], path: "/private/work/player.ts" }],
    })).malformed).toBe(true);
  });
});
