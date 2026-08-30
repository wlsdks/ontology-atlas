import { describe, expect, it } from "vitest";
import type { OntologyTreeNode } from "@/entities/knowledge-graph/lib/ontology-tree";
import type { KnowledgeGraphNode } from "@/entities/knowledge-graph";
import {
  flattenVisibleRowIds,
  nextRovingId,
  resolveActiveRowId,
} from "./roving-tabindex";

function node(id: string): KnowledgeGraphNode {
  return {
    id,
    title: id,
    kind: "capability",
    projectIds: [],
    evidenceIds: [],
    lastApprovedAt: new Date("2026-04-27"),
    lastApprovedBy: "system",
  };
}

function tree(id: string, children: OntologyTreeNode[] = [], depth = 0): OntologyTreeNode {
  return { node: node(id), depth, children };
}

// project ─ domainA ─ capA1, capA2   /   domainB ─ capB1
const roots: OntologyTreeNode[] = [
  tree("project", [
    tree("domainA", [tree("capA1"), tree("capA2")]),
    tree("domainB", [tree("capB1")]),
  ]),
];

describe("flattenVisibleRowIds", () => {
  it("collapsed children are skipped (only open parents recurse)", () => {
    // Nothing expanded → the root only.
    expect(flattenVisibleRowIds(roots, () => false)).toEqual(["project"]);
  });

  it("open parents expose their children in DOM order", () => {
    const open = new Set(["project", "domainA"]);
    expect(flattenVisibleRowIds(roots, (id) => open.has(id))).toEqual([
      "project",
      "domainA",
      "capA1",
      "capA2",
      "domainB",
    ]);
  });

  it("fully open tree flattens depth-first", () => {
    expect(flattenVisibleRowIds(roots, () => true)).toEqual([
      "project",
      "domainA",
      "capA1",
      "capA2",
      "domainB",
      "capB1",
    ]);
  });
});

describe("nextRovingId", () => {
  const ids = ["a", "b", "c"];

  it("ArrowDown moves to next sibling and clamps at the end", () => {
    expect(nextRovingId(ids, "a", "ArrowDown")).toBe("b");
    expect(nextRovingId(ids, "c", "ArrowDown")).toBe("c");
  });

  it("ArrowUp moves to previous sibling and clamps at the start", () => {
    expect(nextRovingId(ids, "c", "ArrowUp")).toBe("b");
    expect(nextRovingId(ids, "a", "ArrowUp")).toBe("a");
  });

  it("Home/End jump to the extremes", () => {
    expect(nextRovingId(ids, "b", "Home")).toBe("a");
    expect(nextRovingId(ids, "b", "End")).toBe("c");
  });

  it("an out-of-list current id lands on the first row", () => {
    expect(nextRovingId(ids, "gone", "ArrowDown")).toBe("a");
    expect(nextRovingId(ids, null, "ArrowUp")).toBe("a");
  });

  it("empty list yields null", () => {
    expect(nextRovingId([], "a", "ArrowDown")).toBeNull();
  });
});

describe("resolveActiveRowId", () => {
  const ids = ["a", "b", "c"];

  it("keeps a still-visible active row", () => {
    expect(resolveActiveRowId(ids, "b", null)).toBe("b");
  });

  it("falls back to the selected node when active is gone", () => {
    expect(resolveActiveRowId(ids, "gone", "c")).toBe("c");
  });

  it("falls back to the first row when neither active nor selected is visible", () => {
    expect(resolveActiveRowId(ids, "gone", "also-gone")).toBe("a");
    expect(resolveActiveRowId(ids, null, null)).toBe("a");
  });

  it("empty list yields null", () => {
    expect(resolveActiveRowId([], "a", "b")).toBeNull();
  });
});
