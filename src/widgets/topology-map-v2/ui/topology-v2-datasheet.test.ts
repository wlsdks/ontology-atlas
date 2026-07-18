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

  it("collapses the SAME neighbor+direction within a group even when relationType differs (mcp-server live bug: depends_on AND related_to to the same neighbor)", () => {
    // The datasheet panel keys rows by (group, id) and shows only the title —
    // it has no separate UI for "this is depends_on vs related_to" — so two
    // rows for the SAME neighbor in the SAME direction read as one duplicated
    // row and collide on the React list key. `buildV2Connections`'s own
    // (id, relationType, direction) dedup can't catch this because the
    // relationType genuinely differs; this is a SEPARATE, group-level collapse.
    const grouped = groupV2Connections([
      conn({ id: "frontmatter-to-ontology", relationType: "depends_on", direction: "outgoing" }),
      conn({ id: "frontmatter-to-ontology", relationType: "related_to", direction: "outgoing" }),
    ]);
    expect(grouped.depends).toHaveLength(1);
    expect(grouped.depends[0]).toMatchObject({ id: "frontmatter-to-ontology", relationType: "depends_on" });
  });

  it("keeps the SAME neighbor id as two rows when it appears in OPPOSITE directions (a real mutual-dependency fact, not a duplicate)", () => {
    const grouped = groupV2Connections([
      conn({ id: "vault-local-first", relationType: "depends_on", direction: "outgoing" }),
      conn({ id: "vault-local-first", relationType: "depends_on", direction: "incoming" }),
    ]);
    expect(grouped.depends).toHaveLength(2);
    expect(grouped.depends.map((c) => c.direction)).toEqual(["outgoing", "incoming"]);
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

  it("dedupes parallel edges (same neighbor, same relation type + direction), keeping the first occurrence (React duplicate-key regression)", () => {
    // Reproduces the live dogfood bug: `capability:mcp-server` had TWO
    // `depends_on` edges to `capability:frontmatter-to-ontology` (one direct,
    // one re-derived) — the datasheet rendered both as a React list keyed by
    // neighbor id, producing "Encountered two children with the same key"
    // and a visibly duplicated DEPENDS row.
    const parallelNodes = [
      { id: "mcp-server", title: "MCP Server", kind: "capability" },
      { id: "frontmatter-to-ontology", title: "Frontmatter → Ontology Stub", kind: "capability" },
    ];
    const parallelEdges = [
      { from: "mcp-server", to: "frontmatter-to-ontology", type: "depends_on" },
      { from: "mcp-server", to: "frontmatter-to-ontology", type: "depends_on" },
      { from: "mcp-server", to: "frontmatter-to-ontology", type: "depends_on" },
    ];
    const connections = buildV2Connections("mcp-server", parallelNodes, parallelEdges);
    expect(connections).toHaveLength(1);
    expect(connections[0]).toMatchObject({ id: "frontmatter-to-ontology", relationType: "depends_on", direction: "outgoing" });
  });

  it("keeps distinct rows for the SAME neighbor when the relation type or direction differs", () => {
    const nodes2 = [
      { id: "a", title: "A", kind: "capability" },
      { id: "b", title: "B", kind: "capability" },
    ];
    const edges2 = [
      { from: "a", to: "b", type: "depends_on" },
      { from: "a", to: "b", type: "uses" }, // same pair, different relation type
      { from: "b", to: "a", type: "depends_on" }, // same pair+type, opposite direction
    ];
    const connections = buildV2Connections("a", nodes2, edges2);
    expect(connections).toHaveLength(3);
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
