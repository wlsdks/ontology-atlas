import { describe, expect, it } from "vitest";
import type { ReviewQueueRow } from "@/entities/docs-vault";
import type { KnowledgeGraphNode } from "@/entities/knowledge-graph";
import { buildProjectToCheck, selectVisibleRows, type ProjectToCheckInput, type ToCheckRow } from "./project-to-check";

const SLUG = "shop";

function concept(slug: string, kind: string, title: string, projectIds: string[] = [SLUG], display?: string): KnowledgeGraphNode {
  return {
    id: `${kind}:${slug}`,
    title,
    ...(display ? { display } : {}),
    kind,
    projectIds,
    evidenceIds: [`docs/${slug}`],
    lastApprovedAt: new Date(0),
    lastApprovedBy: "test",
  };
}

function input(overrides: Partial<ProjectToCheckInput>): ProjectToCheckInput {
  return {
    nodes: [],
    projectSlug: SLUG,
    reviewRows: [],
    stalePaths: new Map(),
    findingsBySlug: new Map(),
    domainNameById: new Map(),
    ...overrides,
  };
}

const row = (reason: ToCheckRow["reason"], name: string): ToCheckRow => ({ reason, nodeId: name, docSlug: null, name, kind: "capability", domainName: null });
const reasonsOf = (rows: readonly ToCheckRow[]) => rows.map((r) => r.reason);

describe("buildProjectToCheck", () => {
  it("ranks reasons: raised, changed after review, stale, unverifiable, then a missing definition", () => {
    const nodes = ["a", "b", "c", "d", "e"].map((s) => concept(s, "capability", s.toUpperCase()));
    const reviewRows: ReviewQueueRow[] = [
      { slug: "docs/d", title: "D", reason: "unverifiable" },
      { slug: "docs/b", title: "B", reason: "changed-since-review", reviewedBy: "kim" },
      { slug: "docs/a", title: "A", reason: "raised", note: "One capability or two?" },
    ];
    const result = buildProjectToCheck(
      input({
        nodes,
        reviewRows,
        stalePaths: new Map([["capability:c", { path: "src/c.ts", gone: false, changedAt: "2026-11-10T00:00:00Z" }]]),
        findingsBySlug: new Map([["docs/e", { findings: ["definition-missing"] }]]),
      }),
    );
    expect(reasonsOf(result.rows)).toEqual(["raised", "changed-since-review", "stale", "unverifiable", "definition-missing"]);
    expect(result.rows[0]).toMatchObject({ note: "One capability or two?", docSlug: "docs/a" });
    expect(result.rows[1]).toMatchObject({ reviewedBy: "kim" });
    expect(result.rows[2]).toMatchObject({ path: "src/c.ts", pathGone: false });
  });

  it("orders stale rows gone first, then by the newest code change, then by name", () => {
    const nodes = ["old", "new", "gone", "same-a", "same-b"].map((s) => concept(s, "capability", s));
    const stalePaths = new Map([
      ["capability:old", { path: "src/old.ts", gone: false, changedAt: "2026-11-01T00:00:00Z" }],
      ["capability:new", { path: "src/new.ts", gone: false, changedAt: "2026-11-15T00:00:00Z" }],
      ["capability:gone", { path: "src/gone.ts", gone: true, changedAt: null }],
      ["capability:same-b", { path: "src/b.ts", gone: false, changedAt: "2026-11-05T00:00:00Z" }],
      ["capability:same-a", { path: "src/a.ts", gone: false, changedAt: "2026-11-05T00:00:00Z" }],
    ]);
    const { rows } = buildProjectToCheck(input({ nodes, stalePaths }));
    expect(rows.map((r) => r.name)).toEqual(["gone", "new", "same-a", "same-b", "old"]);
  });

  it("breaks ties inside a reason by the display name the page shows", () => {
    const nodes = [concept("x", "capability", "Zeta", [SLUG], "Alpha"), concept("y", "capability", "Beta")];
    const findingsBySlug = new Map([
      ["docs/x", { findings: ["definition-missing"] }],
      ["docs/y", { findings: ["definition-missing"] }],
    ]);
    const { rows } = buildProjectToCheck(input({ nodes, findingsBySlug }));
    expect(rows.map((r) => r.name)).toEqual(["Alpha", "Beta"]);
  });

  it("leaves out concepts of another project and stale marks on anything but a capability", () => {
    const nodes = [
      concept("mine", "capability", "Mine"),
      concept("theirs", "capability", "Theirs", ["other"]),
      concept("part", "element", "Part"),
    ];
    const stalePaths = new Map([
      ["capability:mine", { path: "src/mine.ts", gone: false, changedAt: null }],
      ["capability:theirs", { path: "src/theirs.ts", gone: false, changedAt: null }],
      ["element:part", { path: "src/part.ts", gone: false, changedAt: null }],
    ]);
    const reviewRows: ReviewQueueRow[] = [{ slug: "docs/theirs", title: "Theirs", reason: "raised" }];
    const { rows } = buildProjectToCheck(input({ nodes, stalePaths, reviewRows }));
    expect(rows.map((r) => r.nodeId)).toEqual(["capability:mine"]);
  });

  it("lists a missing definition once, for the document that lacks it, not for the concepts it names", () => {
    const pay = concept("pay", "capability", "Pay");
    const stub = (slug: string): KnowledgeGraphNode => ({ ...concept(slug, "element", slug), evidenceIds: ["docs/pay"], hasOwnDocument: false });
    const findingsBySlug = new Map([["docs/pay", { findings: ["definition-missing"] }]]);
    const { rows } = buildProjectToCheck(input({ nodes: [pay, stub("ledger"), stub("gateway")], findingsBySlug }));
    expect(rows.map((r) => r.nodeId)).toEqual(["capability:pay"]);
  });

  it("shows a concept once, under its highest-ranked reason, and counts concepts rather than reasons", () => {
    const nodes = [concept("pay", "capability", "Pay"), concept("ship", "capability", "Ship")];
    const result = buildProjectToCheck(
      input({
        nodes,
        reviewRows: [{ slug: "docs/pay", title: "Pay", reason: "raised", note: "One or two?" }],
        stalePaths: new Map([["capability:pay", { path: "src/pay.ts", gone: false, changedAt: "2026-11-10T00:00:00Z" }]]),
        findingsBySlug: new Map([
          ["docs/pay", { findings: ["definition-missing"] }],
          ["docs/ship", { findings: ["definition-missing"] }],
        ]),
      }),
    );
    expect(result.visible.map((r) => [r.reason, r.nodeId])).toEqual([
      ["raised", "capability:pay"],
      ["definition-missing", "capability:ship"],
    ]);
    expect(result.conceptCount).toBe(2);
    expect(reasonsOf(result.rows)).toEqual(["raised", "stale", "definition-missing", "definition-missing"]);
  });

  it("names the domain a row belongs to", () => {
    const nodes = [concept("a", "capability", "A")];
    const findingsBySlug = new Map([["docs/a", { findings: ["definition-missing"] }]]);
    const { rows } = buildProjectToCheck(input({ nodes, findingsBySlug, domainNameById: new Map([["capability:a", "Orders"]]) }));
    expect(rows[0]?.domainName).toBe("Orders");
  });
});

describe("selectVisibleRows", () => {
  it("holds one reason to two of three slots while another reason has a row waiting", () => {
    const rows = [row("stale", "s1"), row("stale", "s2"), row("stale", "s3"), row("definition-missing", "d1")];
    expect(selectVisibleRows(rows).map((r) => r.name)).toEqual(["s1", "s2", "d1"]);
  });

  it("gives the third slot back to a held reason when nothing else waits", () => {
    const rows = [row("stale", "s1"), row("stale", "s2"), row("stale", "s3")];
    expect(selectVisibleRows(rows).map((r) => r.name)).toEqual(["s1", "s2", "s3"]);
  });

  it("keeps rank order across three reasons", () => {
    const rows = [row("raised", "r1"), row("raised", "r2"), row("raised", "r3"), row("stale", "s1"), row("definition-missing", "d1")];
    expect(selectVisibleRows(rows).map((r) => r.name)).toEqual(["r1", "r2", "s1"]);
  });

  it("shows fewer rows than slots when fewer exist", () => {
    expect(selectVisibleRows([row("stale", "s1")])).toHaveLength(1);
    expect(selectVisibleRows([])).toEqual([]);
  });
});
