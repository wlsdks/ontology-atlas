import { describe, expect, it } from "vitest";

import {
  buildV2Connections,
  buildV2ConnectionGroups,
  buildV2EvidenceRows,
  formatV2HandoffText,
  reasonsByRelation,
  shownReachRows,
  slugDisplaySegment,
  type V2DatasheetConnection,
} from "./map-datasheet";

const conn = (
  partial: Partial<V2DatasheetConnection> & { id: string; relationType: string },
): V2DatasheetConnection => ({
  title: partial.id,
  kind: "capability",
  direction: "outgoing",
  ...partial,
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
    // and a visibly duplicated row.
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

describe("buildV2ConnectionGroups — M-2 ROLE axis, single source for metric + header parity", () => {
  it("splits containment into its OWN holds and belongs-to groups instead of folding by direction (the domain-popover bug)", () => {
    // The exact UX-round case: a domain node with 18 `contains` children + a
    // few depends/used edges. Direction-only grouping put the 18 children in
    // "DependsOn"; role grouping keeps them in `contains`.
    const connections: V2DatasheetConnection[] = [
      ...Array.from({ length: 18 }, (_, i) =>
        conn({ id: `child-${i}`, relationType: "contains", direction: "outgoing" }),
      ),
      conn({ id: "user-a", relationType: "depends_on", direction: "incoming" }),
      conn({ id: "user-b", relationType: "uses", direction: "incoming" }),
      conn({ id: "user-c", relationType: "implements", direction: "incoming" }),
      conn({ id: "user-d", relationType: "related_to", direction: "incoming" }),
      conn({ id: "dep-a", relationType: "depends_on", direction: "outgoing" }),
      conn({ id: "dep-b", relationType: "related_to", direction: "outgoing" }),
      conn({ id: "parent", relationType: "belongs_to", direction: "outgoing" }),
    ];
    const groups = buildV2ConnectionGroups(connections, 6);
    expect(groups.contains.total).toBe(18);
    expect(groups.contains.rows).toHaveLength(6); // capped, true total preserved
    expect(groups.usedBy.total).toBe(3);
    expect(groups.dependsOn.total).toBe(1);
    expect(groups.belongsTo.total).toBe(1);
    // `related_to` names no direction, so either way it is related, not used or leaned on.
    expect(groups.related.rows.map((row) => row.id)).toEqual(["user-d", "dep-b"]);
  });

  it("caps each group independently and never starves the smaller ones", () => {
    const connections: V2DatasheetConnection[] = [
      ...Array.from({ length: 8 }, (_, i) =>
        conn({ id: `c${i}`, relationType: "contains", direction: "outgoing" }),
      ),
      conn({ id: "u0", relationType: "depends_on", direction: "incoming" }),
      conn({ id: "u1", relationType: "uses", direction: "incoming" }),
    ];
    const groups = buildV2ConnectionGroups(connections, 6);
    expect(groups.contains.total).toBe(8);
    expect(groups.contains.rows).toHaveLength(6); // capped
    expect(groups.usedBy.total).toBe(2);
    expect(groups.usedBy.rows.map((r) => r.id)).toEqual(["u0", "u1"]); // never starved
  });

  it("handles an empty set with zero totals across every role group", () => {
    const groups = buildV2ConnectionGroups([]);
    expect(groups).toEqual({
      contains: { rows: [], allRows: [], total: 0 },
      usedBy: { rows: [], allRows: [], total: 0 },
      dependsOn: { rows: [], allRows: [], total: 0 },
      belongsTo: { rows: [], allRows: [], total: 0 },
      related: { rows: [], allRows: [], total: 0 },
    });
  });

  it("collapses the same neighbor within one group even when the relation types differ", () => {
    const groups = buildV2ConnectionGroups([
      conn({ id: "frontmatter-to-ontology", relationType: "depends_on", direction: "outgoing" }),
      conn({ id: "frontmatter-to-ontology", relationType: "uses", direction: "outgoing" }),
    ]);
    expect(groups.dependsOn.rows).toHaveLength(1);
    expect(groups.dependsOn.rows[0]).toMatchObject({ id: "frontmatter-to-ontology", relationType: "depends_on" });
  });

  it("keeps a neighbor that is both leaned on and related as one row in each, two written facts", () => {
    const groups = buildV2ConnectionGroups([
      conn({ id: "frontmatter-to-ontology", relationType: "depends_on", direction: "outgoing" }),
      conn({ id: "frontmatter-to-ontology", relationType: "related_to", direction: "outgoing" }),
    ]);
    expect(groups.dependsOn.rows.map((c) => c.id)).toEqual(["frontmatter-to-ontology"]);
    expect(groups.related.rows.map((c) => c.id)).toEqual(["frontmatter-to-ontology"]);
  });

  it("keeps the same neighbor in both directions as two facts, a mutual dependency", () => {
    const groups = buildV2ConnectionGroups([
      conn({ id: "vault-local-first", relationType: "depends_on", direction: "outgoing" }),
      conn({ id: "vault-local-first", relationType: "depends_on", direction: "incoming" }),
    ]);
    expect(groups.usedBy.rows.map((c) => c.id)).toEqual(["vault-local-first"]);
    expect(groups.dependsOn.rows.map((c) => c.id)).toEqual(["vault-local-first"]);
  });

  it("a leaf node (no containment) still splits cleanly into usedBy/dependsOn with empty contains", () => {
    const connections: V2DatasheetConnection[] = [
      conn({ id: "in-1", relationType: "depends_on", direction: "incoming" }),
      conn({ id: "in-2", relationType: "uses", direction: "incoming" }),
      conn({ id: "out-1", relationType: "depends_on", direction: "outgoing" }),
    ];
    const groups = buildV2ConnectionGroups(connections);
    expect(groups.contains.total).toBe(0);
    expect(groups.usedBy.total).toBe(2);
    expect(groups.dependsOn.total).toBe(1);
    expect(groups.belongsTo.total).toBe(0);
  });
});

describe("formatV2HandoffText", () => {
  it("emits a deterministic payload with contains split out of depends_on, matching the panel's typed groups", () => {
    const text = formatV2HandoffText({
      source: "loaded-vault",
      slug: "ai-agent-partner",
      kind: "domain",
      domainTitle: "AI Agent Partner",
      contains: 18,
      usedBy: 4,
      dependsOn: 2,
      belongsTo: 1,
      related: 2,
      evidence: 1,
      containsNames: ["mcp-server", "agent-config-onboarding"],
      usedByNames: ["frontmatter-to-ontology"],
      dependsNames: ["relation-graph"],
      belongsToNames: ["ontology-atlas"],
      relatedNames: ["mcp-tool-server", "agent-handoff"],
    });
    expect(text).toBe(
      [
        "source: loaded-vault",
        "node: ai-agent-partner",
        "has_document: yes",
        "kind: domain",
        "domain: AI Agent Partner",
        "contains: 18",
        "used_by: 4",
        "depends_on: 2",
        "belongs_to: 1",
        "related: 2",
        "evidence: 1",
        "contains_names: mcp-server, agent-config-onboarding",
        "used_by_names: frontmatter-to-ontology",
        "depends_names: relation-graph",
        "belongs_to_names: ontology-atlas",
        "related_names: mcp-tool-server, agent-handoff",
        'next: get_concept("ai-agent-partner") → review context, then patch_concept / add_relation as needed',
      ].join("\n"),
    );
  });

  it("falls back to '-' for a missing domain and for empty name lists", () => {
    const text = formatV2HandoffText({
      source: "loaded-vault",
      slug: "orphan",
      kind: "element",
      domainTitle: null,
      contains: 0,
      usedBy: 0,
      dependsOn: 0,
      belongsTo: 0,
      related: 0,
      evidence: 0,
      containsNames: [],
      usedByNames: [],
      dependsNames: [],
      belongsToNames: [],
      relatedNames: [],
    });
    expect(text).toContain("domain: -");
    expect(text).toContain("contains_names: -");
    expect(text).toContain("used_by_names: -");
    expect(text).toContain("depends_names: -");
    expect(text).toContain("belongs_to_names: -");
    expect(text).toContain("related_names: -");
  });

  it("marks read-only sample facts and never suggests MCP reads or writes against a vault", () => {
    const text = formatV2HandoffText({
      source: "read-only-sample",
      slug: "capabilities/product-register",
      kind: "capability",
      domainTitle: "상품",
      contains: 1,
      usedBy: 0,
      dependsOn: 0,
      belongsTo: 1,
      related: 0,
      evidence: 1,
      containsNames: ["상품 이미지 스토리지"],
      usedByNames: [],
      dependsNames: [],
      belongsToNames: ["상품"],
      relatedNames: [],
    });

    expect(text).toContain("source: read-only-sample");
    expect(text).toContain(
      "write_guard: do not run get_concept / patch_concept / add_relation for this sample node",
    );
    expect(text).toContain(
      "next: open a markdown vault, then copy a node handoff from that loaded vault",
    );
    expect(text).not.toContain('get_concept("capabilities/product-register")');
  });
});

describe("buildV2EvidenceRows: evidence group promotion", () => {
  it("splits a folder/slug evidenceId into a readable title + path, mirroring the mockup's doc-link row", () => {
    expect(buildV2EvidenceRows(["capabilities/product-owner-operating-system"])).toEqual([
      {
        id: "capabilities/product-owner-operating-system",
        title: "product-owner-operating-system",
        path: "capabilities/",
      },
    ]);
  });

  it("uses the whole slug as the title with a null path when there is no folder segment", () => {
    expect(buildV2EvidenceRows(["standalone-doc"])).toEqual([
      { id: "standalone-doc", title: "standalone-doc", path: null },
    ]);
  });

  it("returns one row per evidenceId, preserving input order", () => {
    expect(
      buildV2EvidenceRows(["elements/a", "elements/b"]).map((row) => row.id),
    ).toEqual(["elements/a", "elements/b"]);
  });

  it("returns an empty array for an empty evidenceIds list", () => {
    expect(buildV2EvidenceRows([])).toEqual([]);
  });

  it("skips blank entries defensively", () => {
    expect(buildV2EvidenceRows(["", "  ", "capabilities/x"])).toEqual([
      { id: "capabilities/x", title: "x", path: "capabilities/" },
    ]);
  });
});

describe("slugDisplaySegment: sticky footer slug in plain language", () => {
  it("returns the last path segment of a folder-shaped slug", () => {
    expect(slugDisplaySegment("ontology/capabilities/mcp-server")).toBe("mcp-server");
  });

  it("returns the slug unchanged when it has no folder segment", () => {
    expect(slugDisplaySegment("standalone-doc")).toBe("standalone-doc");
  });

  it("returns an empty string for a trailing-slash slug (defensive, no crash)", () => {
    expect(slugDisplaySegment("domains/")).toBe("");
  });
});

describe("shownReachRows", () => {
  it.each([
    [0, 0],
    [1, 1],
    [6, 6],
    [7, 5],
    [40, 5],
  ])("shows %i rows as %i while folded", (total, shown) => {
    expect(shownReachRows(total, false)).toBe(shown);
  });

  it("shows every row once opened", () => {
    expect(shownReachRows(40, true)).toBe(40);
  });
});

describe("reasonsByRelation", () => {
  it("finds a reason by direction and far concept, so the same neighbour can carry two", () => {
    const groups = buildV2ConnectionGroups([
      conn({ id: "pay", relationType: "depends_on", reason: "Charges the card." }),
      conn({ id: "pay", relationType: "depends_on", direction: "incoming", reason: "Refunds return here." }),
      conn({ id: "search", relationType: "related_to", reason: "Shares the index." }),
      conn({ id: "cart", relationType: "depends_on", reason: null }),
    ]);
    const reasons = reasonsByRelation(groups);
    expect(reasons.get("out:pay")).toBe("Charges the card.");
    expect(reasons.get("in:pay")).toBe("Refunds return here.");
    expect(reasons.get("out:search")).toBe("Shares the index.");
    expect(reasons.has("out:cart")).toBe(false);
  });

  it("reads past the capped preview", () => {
    const rows = Array.from({ length: 9 }, (_, i) => conn({ id: `c${i}`, relationType: "depends_on", reason: `Reason ${i}` }));
    expect(reasonsByRelation(buildV2ConnectionGroups(rows)).get("out:c8")).toBe("Reason 8");
  });
});
