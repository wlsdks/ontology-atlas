import { describe, expect, it } from "vitest";

import {
  buildV2Connections,
  buildV2ConnectionGroups,
  buildV2EvidenceRows,
  formatV2HandoffText,
  buildV2MetricSegments,
  formatV2MetricLine,
  groupV2ConnectionsByDirection,
  slugDisplaySegment,
  summarizeContainsByPathPrefix,
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

describe("groupV2ConnectionsByDirection — DIRECTION is the grouping axis, not relation type", () => {
  it("splits incoming (usedBy) from outgoing (dependsOn) regardless of relation type", () => {
    const grouped = groupV2ConnectionsByDirection([
      conn({ id: "child-a", relationType: "contains", direction: "outgoing" }),
      conn({ id: "parent", relationType: "belongs_to", direction: "incoming" }),
      conn({ id: "dep-x", relationType: "depends_on", direction: "outgoing" }),
      conn({ id: "impl-y", relationType: "implements", direction: "incoming" }),
      conn({ id: "use-z", relationType: "uses", direction: "outgoing" }),
    ]);
    expect(grouped.usedBy.map((c) => c.id)).toEqual(["parent", "impl-y"]);
    expect(grouped.dependsOn.map((c) => c.id)).toEqual(["child-a", "dep-x", "use-z"]);
  });

  it("preserves input order within each group and handles an empty list", () => {
    expect(groupV2ConnectionsByDirection([])).toEqual({ usedBy: [], dependsOn: [] });
  });

  it("collapses the SAME neighbor id within a direction even when relationType differs (mcp-server live bug: depends_on AND related_to to the same neighbor)", () => {
    // The datasheet panel keys rows by (direction, id) and shows only the
    // title + a per-row type mark — two rows for the SAME neighbor in the
    // SAME direction would otherwise read as one duplicated row and collide
    // on the React list key.
    const grouped = groupV2ConnectionsByDirection([
      conn({ id: "frontmatter-to-ontology", relationType: "depends_on", direction: "outgoing" }),
      conn({ id: "frontmatter-to-ontology", relationType: "related_to", direction: "outgoing" }),
    ]);
    expect(grouped.dependsOn).toHaveLength(1);
    expect(grouped.dependsOn[0]).toMatchObject({ id: "frontmatter-to-ontology", relationType: "depends_on" });
  });

  it("keeps the SAME neighbor id as two rows when it appears in OPPOSITE directions (a real mutual-dependency fact, not a duplicate)", () => {
    const grouped = groupV2ConnectionsByDirection([
      conn({ id: "vault-local-first", relationType: "depends_on", direction: "outgoing" }),
      conn({ id: "vault-local-first", relationType: "depends_on", direction: "incoming" }),
    ]);
    expect(grouped.usedBy.map((c) => c.id)).toEqual(["vault-local-first"]);
    expect(grouped.dependsOn.map((c) => c.id)).toEqual(["vault-local-first"]);
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
  it("splits containment into its OWN 담는 것/속한 곳 groups instead of folding by direction (the domain-popover bug)", () => {
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
    // container 18 · writer 4 · supporter 2 · member 1 — matches full-detail.
    expect(groups.contains.total).toBe(18);
    expect(groups.contains.rows).toHaveLength(6); // capped, true total preserved
    expect(groups.usedBy.total).toBe(4);
    expect(groups.dependsOn.total).toBe(2);
    expect(groups.belongsTo.total).toBe(1);
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

  it("handles an empty set with zero totals across all four role groups", () => {
    const groups = buildV2ConnectionGroups([]);
    expect(groups).toEqual({
      // S2 part 3 — contains also carries the path-prefix summary (empty in, empty summary out).
      contains: { rows: [], allRows: [], total: 0, summary: { groups: [], otherCount: 0, total: 0, usable: false } },
      usedBy: { rows: [], allRows: [], total: 0 },
      dependsOn: { rows: [], allRows: [], total: 0 },
      belongsTo: { rows: [], allRows: [], total: 0 },
    });
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

describe("formatV2MetricLine — M-2 typed segments", () => {
  const labels = {
    contains: "담는 것",
    usedBy: "쓰는 곳",
    dependsOn: "기대는 곳",
    belongsTo: "속한 곳",
    evidence: "근거",
  };

  it("prepends 담는 것 for a container node (contains > 0) — the typed split", () => {
    expect(
      formatV2MetricLine({ contains: 18, usedBy: 4, dependsOn: 2, belongsTo: 0, evidence: 1 }, labels),
    ).toBe("담는 것 18 · 쓰는 곳 4 · 기대는 곳 2 · 근거 1");
  });

  it("hides the 담는 것 segment for a leaf (contains === 0) so it isn't a noisy '담는 것 0'", () => {
    expect(
      formatV2MetricLine({ contains: 0, usedBy: 3, dependsOn: 5, belongsTo: 0, evidence: 2 }, labels),
    ).toBe("쓰는 곳 3 · 기대는 곳 5 · 근거 2");
  });

  it("keeps the remaining three facts' zeros explicit", () => {
    expect(
      formatV2MetricLine({ contains: 0, usedBy: 0, dependsOn: 0, belongsTo: 0, evidence: 0 }, labels),
    ).toBe("쓰는 곳 0 · 기대는 곳 0 · 근거 0");
  });

  // Datasheet internal refinement (2026-07-23) — segments are exposed structured so
  // the panel can render label ink apart from value ink. The key matches the
  // `data-datasheet-group` id of the connection group below, which pins in the type
  // that the strip count and the group count are the same fact by construction.
  it("buildV2MetricSegments exposes the same segments structured, keyed by the group ids", () => {
    expect(
      buildV2MetricSegments({ contains: 18, usedBy: 4, dependsOn: 2, belongsTo: 0, evidence: 1 }, labels),
    ).toEqual([
      { key: "contains", label: "담는 것", value: 18 },
      { key: "usedBy", label: "쓰는 곳", value: 4 },
      { key: "dependsOn", label: "기대는 곳", value: 2 },
      { key: "evidence", label: "근거", value: 1 },
    ]);
  });

  it("buildV2MetricSegments omits the contains segment for a leaf, like the joined line", () => {
    expect(
      buildV2MetricSegments({ contains: 0, usedBy: 3, dependsOn: 5, belongsTo: 0, evidence: 2 }, labels).map(
        (s) => s.key,
      ),
    ).toEqual(["usedBy", "dependsOn", "evidence"]);
  });
});

describe("formatV2HandoffText — M-2 contains split", () => {
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
      evidence: 1,
      containsNames: ["mcp-server", "agent-config-onboarding"],
      usedByNames: ["frontmatter-to-ontology"],
      dependsNames: ["relation-graph"],
      belongsToNames: ["ontology-atlas"],
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
        "evidence: 1",
        "contains_names: mcp-server, agent-config-onboarding",
        "used_by_names: frontmatter-to-ontology",
        "depends_names: relation-graph",
        "belongs_to_names: ontology-atlas",
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
      evidence: 0,
      containsNames: [],
      usedByNames: [],
      dependsNames: [],
      belongsToNames: [],
    });
    expect(text).toContain("domain: -");
    expect(text).toContain("contains_names: -");
    expect(text).toContain("used_by_names: -");
    expect(text).toContain("depends_names: -");
    expect(text).toContain("belongs_to_names: -");
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
      evidence: 1,
      containsNames: ["상품 이미지 스토리지"],
      usedByNames: [],
      dependsNames: [],
      belongsToNames: ["상품"],
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

describe("buildV2EvidenceRows — 근거(evidence) group promotion (RATIO-SYSTEM §4)", () => {
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

// Toss C2 (audience-language plain-wording pass, 2026-07-24) — the sticky footer
// folds the full slug behind a hover title and shows only this segment in visible text.
describe("slugDisplaySegment — sticky 푸터 slug 평문화 (Toss C2)", () => {
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

describe("summarizeContainsByPathPrefix (S2 파트 3)", () => {
  const el = (idPath: string): V2DatasheetConnection =>
    conn({ id: `element:${idPath}`, relationType: "contains", direction: "outgoing" });

  it("경로 프리픽스별 집계 + count 내림차순, 동률 key 사전순, 나머지는 기타", () => {
    const rows: V2DatasheetConnection[] = [
      ...Array.from({ length: 4 }, (_, i) => el(`cli/src/commands/c${i}`)),
      ...Array.from({ length: 2 }, (_, i) => el(`.claude/skills/s${i}`)),
      el("cli/src/lib/one"),
      el("solo"), // No slash → Other (other)
    ];
    const summary = summarizeContainsByPathPrefix(rows, 2);
    expect(summary.total).toBe(8);
    // Top 2: cli/src/commands(4), .claude/skills(2)
    expect(summary.groups).toEqual([
      { key: "cli/src/commands", count: 4 },
      { key: ".claude/skills", count: 2 },
    ]);
    // The rest: cli/src/lib(1) + solo (no prefix, 1) = 2
    expect(summary.otherCount).toBe(2);
  });

  it("결정론 — 같은 입력 두 번 → 같은 결과", () => {
    const rows = [el("a/b/x"), el("a/b/y"), el("c/d/z")];
    expect(summarizeContainsByPathPrefix(rows)).toEqual(summarizeContainsByPathPrefix(rows));
  });

  it("buildV2ConnectionGroups 는 contains 에 summary 를 싣는다", () => {
    const rows = Array.from({ length: 3 }, (_, i) => el(`p/q/e${i}`));
    const groups = buildV2ConnectionGroups(rows);
    expect(groups.contains.summary).toBeDefined();
    expect(groups.contains.summary?.total).toBe(3);
    expect(groups.contains.summary?.usable).toBe(true);
    expect(groups.usedBy.summary).toBeUndefined();
  });

  // B4 (H1) — rescue a summary collapsing into one 「Other」 lump by re-splitting, then by falling back to the list.
  it('깊은 프리픽스가 전부 흩어져 "기타"가 과반이면 1단계 프리픽스로 재분할', () => {
    const rows: V2DatasheetConnection[] = [
      ...["a", "b", "c", "d", "e", "f"].map((s) => el(`cli/${s}/x`)),
      ...["g", "h", "i", "j"].map((s) => el(`src/${s}/y`)),
    ];
    // The deep prefixes (cli/a … src/j) are all count 1 → only the top 4 are named and
    // the remaining 6 go to Other. Other (6) is the majority, so it re-splits on the
    // one-level prefix (cli/src) and takes the side that actually divides.
    const summary = summarizeContainsByPathPrefix(rows, 4);
    expect(summary.usable).toBe(true);
    expect(summary.groups).toEqual([
      { key: "cli", count: 6 },
      { key: "src", count: 4 },
    ]);
    expect(summary.otherCount).toBe(0);
  });

  it("슬래시가 없어 나눌 수 없으면 usable=false (패널은 리스트로 폴백)", () => {
    const rows = [el("add"), el("list"), el("find")];
    const summary = summarizeContainsByPathPrefix(rows, 4);
    expect(summary.usable).toBe(false);
    expect(summary.groups).toEqual([]);
    expect(summary.otherCount).toBe(3);
    expect(summary.total).toBe(3);
  });
});
