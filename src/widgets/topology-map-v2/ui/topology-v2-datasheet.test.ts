import { describe, expect, it } from "vitest";

import {
  buildV2Connections,
  buildV2ConnectionGroups,
  formatV2HandoffText,
  formatV2MetricLine,
  groupV2Connections,
  type V2DatasheetConnection,
} from "./topology-v2-datasheet";

const conn = (
  partial: Partial<V2DatasheetConnection> & { id: string; relationType: string },
): V2DatasheetConnection => ({
  title: partial.id,
  kind: "capability",
  direction: "outgoing",
  ...partial,
});

describe("groupV2Connections", () => {
  it("splits containment relations (contains/belongs_to) from dependency relations", () => {
    const grouped = groupV2Connections([
      conn({ id: "child-a", relationType: "contains" }),
      conn({ id: "parent", relationType: "belongs_to" }),
      conn({ id: "dep-x", relationType: "depends_on" }),
      conn({ id: "impl-y", relationType: "implements" }),
      conn({ id: "use-z", relationType: "uses" }),
    ]);
    expect(grouped.contains.map((c) => c.id)).toEqual(["child-a", "parent"]);
    expect(grouped.depends.map((c) => c.id)).toEqual(["dep-x", "impl-y", "use-z"]);
  });

  it("preserves input order within each group and handles an empty list", () => {
    expect(groupV2Connections([])).toEqual({ contains: [], depends: [] });
  });
});

describe("buildV2Connections", () => {
  const nodes = [
    { id: "hub", title: "MCP Server", kind: "capability" },
    { id: "file-a", title: "index.mjs", kind: "element" },
    { id: "file-b", title: "verify.mjs", kind: "element" },
    { id: "domain", title: "AI Agent Partner", kind: "domain" },
    { id: "dep", title: "Relation Graph", kind: "capability" },
  ];
  const edges = [
    { from: "hub", to: "file-a", type: "contains" },
    { from: "hub", to: "file-b", type: "contains" },
    { from: "hub", to: "dep", type: "depends_on" },
    { from: "domain", to: "hub", type: "contains" },
  ];

  it("returns the FULL direct-connection set, outgoing first then incoming, neighbor-resolved", () => {
    const connections = buildV2Connections("hub", nodes, edges);
    expect(connections.map((c) => [c.id, c.direction, c.relationType])).toEqual([
      ["file-a", "outgoing", "contains"],
      ["file-b", "outgoing", "contains"],
      ["dep", "outgoing", "depends_on"],
      ["domain", "incoming", "contains"],
    ]);
    // carries the neighbor's own title/kind (not the source node's)
    expect(connections[0]).toMatchObject({ title: "index.mjs", kind: "element" });
  });

  it("drops edges whose neighbor is missing and returns [] for an unconnected node", () => {
    expect(buildV2Connections("ghost", nodes, edges)).toEqual([]);
    const dangling = buildV2Connections("hub", nodes, [
      { from: "hub", to: "not-in-nodes", type: "contains" },
    ]);
    expect(dangling).toEqual([]);
  });
});

describe("buildV2ConnectionGroups", () => {
  it("caps each group independently and keeps the TRUE total (contains-hub bug)", () => {
    // 8 contains + 2 depends — the old 5-item outgoing-first slice starved
    // depends to empty; per-group capping keeps both totals honest.
    const connections: V2DatasheetConnection[] = [
      ...Array.from({ length: 8 }, (_, i) =>
        conn({ id: `c${i}`, relationType: "contains" }),
      ),
      conn({ id: "d0", relationType: "depends_on" }),
      conn({ id: "d1", relationType: "uses" }),
    ];
    const groups = buildV2ConnectionGroups(connections, 6);
    expect(groups.contains.total).toBe(8);
    expect(groups.contains.rows).toHaveLength(6); // capped
    expect(groups.depends.total).toBe(2);
    expect(groups.depends.rows.map((r) => r.id)).toEqual(["d0", "d1"]); // never starved
  });

  it("handles an empty set with zero totals", () => {
    const groups = buildV2ConnectionGroups([]);
    expect(groups).toEqual({
      contains: { rows: [], total: 0 },
      depends: { rows: [], total: 0 },
    });
  });
});

describe("formatV2MetricLine", () => {
  const labels = { usedBy: "쓰는 곳", dependsOn: "기대는 곳", evidence: "근거" };

  it("joins the three plain-language facts as ONE engraved line (no triplication)", () => {
    expect(
      formatV2MetricLine({ usedBy: 3, dependsOn: 5, evidence: 2 }, labels),
    ).toBe("쓰는 곳 3 · 기대는 곳 5 · 근거 2");
  });

  it("keeps zeros explicit so the line always has three segments", () => {
    expect(
      formatV2MetricLine({ usedBy: 0, dependsOn: 0, evidence: 0 }, labels),
    ).toBe("쓰는 곳 0 · 기대는 곳 0 · 근거 0");
  });
});

describe("formatV2HandoffText", () => {
  it("emits a deterministic MCP/CLI-style payload with slug, typed facts, and a next action", () => {
    const text = formatV2HandoffText({
      slug: "mcp-server",
      kind: "capability",
      domainTitle: "AI Agent Partner",
      usedBy: 5,
      dependsOn: 2,
      evidence: 3,
      containsNames: ["mcp-tool-registry", "stdio-transport"],
      dependsNames: ["relation-graph"],
    });
    expect(text).toBe(
      [
        "node: mcp-server",
        "kind: capability",
        "domain: AI Agent Partner",
        "used_by: 5",
        "depends_on: 2",
        "evidence: 3",
        "contains: mcp-tool-registry, stdio-transport",
        "depends: relation-graph",
        'next: get_concept("mcp-server") → review context, then patch_concept / add_relation as needed',
      ].join("\n"),
    );
  });

  it("falls back to '-' for a missing domain and for empty connection groups", () => {
    const text = formatV2HandoffText({
      slug: "orphan",
      kind: "element",
      domainTitle: null,
      usedBy: 0,
      dependsOn: 0,
      evidence: 0,
      containsNames: [],
      dependsNames: [],
    });
    expect(text).toContain("domain: -");
    expect(text).toContain("contains: -");
    expect(text).toContain("depends: -");
  });
});
