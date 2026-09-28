import { describe, expect, it } from "vitest";
import type { KnowledgeGraphEdge, KnowledgeGraphNode } from "@/entities/knowledge-graph";
import { computeSubtreeWeights } from "./subtree-weights";

function n(id: string, kind: string): KnowledgeGraphNode {
  return {
    id,
    title: id.toUpperCase(),
    kind,
    projectIds: [],
    evidenceIds: [],
    lastApprovedAt: new Date("2026-01-01T00:00:00Z"),
    lastApprovedBy: "stark",
  };
}

function e(from: string, to: string, type: string): KnowledgeGraphEdge {
  return {
    id: `${from}>${to}:${type}`,
    from,
    to,
    type,
    projectIds: [],
    evidenceIds: [],
    lastApprovedAt: new Date("2026-01-01T00:00:00Z"),
    lastApprovedBy: "stark",
  };
}

describe("computeSubtreeWeights", () => {
  it("counts the elements each node contains, directly and transitively", () => {
    const nodes = [
      n("p", "project"),
      n("d1", "domain"),
      n("d2", "domain"),
      n("c1", "capability"),
      n("c2", "capability"),
      n("c3", "capability"),
      ...["e1", "e2", "e3", "e4", "e5", "e6", "e7"].map((id) => n(id, "element")),
    ];
    const edges = [
      e("p", "d1", "contains"),
      e("p", "d2", "contains"),
      e("d1", "c1", "contains"),
      e("d1", "c2", "contains"),
      e("d2", "c3", "contains"),
      e("c1", "e1", "contains"),
      e("c1", "e2", "contains"),
      e("c1", "e3", "contains"),
      e("e4", "c2", "belongs_to"),
      e("c2", "e5", "contains"),
      e("c3", "e6", "contains"),
      e("d1", "e7", "contains"),
    ];
    const weights = computeSubtreeWeights(nodes, edges);
    expect(["c1", "c2", "c3", "d1", "d2", "p", "e1"].map((slug) => weights.get(slug))).toEqual([3, 2, 1, 6, 1, 7, 0]);
  });

  it("terminates on containment cycles and counts each element once", () => {
    const nodes = [
      n("p", "project"),
      n("d", "domain"),
      n("c1", "capability"),
      n("c2", "capability"),
      n("e1", "element"),
      n("e2", "element"),
    ];
    const edges = [
      e("p", "d", "contains"),
      e("d", "p", "contains"),
      e("d", "c1", "contains"),
      e("d", "c2", "contains"),
      e("c1", "e1", "contains"),
      e("e1", "c1", "contains"),
      e("c1", "c2", "contains"),
      e("c2", "c1", "contains"),
      e("e2", "c2", "belongs_to"),
    ];
    const weights = computeSubtreeWeights(nodes, edges);
    expect(["p", "d", "c1", "c2"].map((slug) => weights.get(slug))).toEqual([2, 2, 2, 2]);
  });

  it("counts an element two capabilities share once in their domain", () => {
    const nodes = [
      n("p", "project"),
      n("d", "domain"),
      n("c1", "capability"),
      n("c2", "capability"),
      n("shared", "element"),
      n("own", "element"),
    ];
    const edges = [
      e("p", "d", "contains"),
      e("d", "c1", "contains"),
      e("d", "c2", "contains"),
      e("c1", "shared", "contains"),
      e("c2", "shared", "contains"),
      e("c2", "own", "contains"),
    ];
    const weights = computeSubtreeWeights(nodes, edges);
    expect(["c1", "c2", "d", "p"].map((slug) => weights.get(slug))).toEqual([1, 2, 2, 2]);
  });
});
