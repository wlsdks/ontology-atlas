import { describe, expect, it } from "vitest";
import type { KnowledgeGraphEdge, KnowledgeGraphNode } from "../../model";
import {
  computeDomainCouplingMatrix,
  computeDegreeCentrality,
  computeKindDistribution,
  rankAllByDegree,
  selectRecentNodes,
} from "./insights";

const node = (
  id: string,
  kind = "capability",
  approvedAt = new Date("2026-04-27T00:00:00Z"),
): KnowledgeGraphNode => ({
  id,
  title: id,
  kind,
  projectIds: [],
  evidenceIds: [],
  lastApprovedAt: approvedAt,
  lastApprovedBy: "test",
});
const edge = (id: string, from: string, to: string): KnowledgeGraphEdge => ({
  id,
  from,
  to,
  type: "depends_on",
  projectIds: [],
  evidenceIds: [],
  lastApprovedAt: new Date("2026-04-27T00:00:00Z"),
  lastApprovedBy: "test",
});

describe("computeKindDistribution", () => {
  it("returns an empty Map for no nodes", () => {
    expect(computeKindDistribution([]).size).toBe(0);
  });

  it("counts nodes per kind across several kinds", () => {
    const dist = computeKindDistribution([
      node("a", "capability"),
      node("b", "capability"),
      node("c", "element"),
      node("d", "domain"),
    ]);
    expect(dist.get("capability")).toBe(2);
    expect(dist.get("element")).toBe(1);
    expect(dist.get("domain")).toBe(1);
  });
});

describe("computeDegreeCentrality", () => {
  it("includes every input node, including degree 0", () => {
    const degrees = computeDegreeCentrality([node("a"), node("b"), node("c")], []);
    expect(degrees.get("a")).toBe(0);
    expect(degrees.get("b")).toBe(0);
    expect(degrees.get("c")).toBe(0);
  });

  it("sums outgoing and incoming edges", () => {
    const degrees = computeDegreeCentrality(
      [node("a"), node("b"), node("c")],
      [edge("e1", "a", "b"), edge("e2", "c", "a")],
    );
    expect(degrees.get("a")).toBe(2); // out + in
    expect(degrees.get("b")).toBe(1);
    expect(degrees.get("c")).toBe(1);
  });

  it("counts a self-loop once", () => {
    const degrees = computeDegreeCentrality([node("a")], [edge("loop", "a", "a")]);
    expect(degrees.get("a")).toBe(1);
  });

  it("ignores edges to missing nodes", () => {
    const degrees = computeDegreeCentrality([node("a")], [edge("e", "a", "ghost")]);
    expect(degrees.get("a")).toBe(1);
    expect(degrees.has("ghost")).toBe(false);
  });
});

describe("rankAllByDegree", () => {
  const nodes = [
    node("hub", "capability"),
    node("leaf-1", "element"),
    node("leaf-2", "element"),
    node("doc-1", "document"),
    node("proj", "project"),
  ];
  const edges = [
    edge("e1", "hub", "leaf-1"),
    edge("e2", "hub", "leaf-2"),
    edge("e3", "doc-1", "hub"),
    edge("e4", "proj", "hub"),
  ];

  it("excludes document and project and sorts by degree by default", () => {
    const all = rankAllByDegree(nodes, edges);
    expect(all).toHaveLength(3); // hub + leaf-1 + leaf-2 (excluding doc / proj)
    expect(all[0]?.node.id).toBe("hub");
    expect(all[0]?.degree).toBeGreaterThanOrEqual(all[1]?.degree ?? 0);
  });

  it("excludes degree-0 nodes", () => {
    const isolated = node("isolated", "capability");
    const all = rankAllByDegree([...nodes, isolated], edges);
    expect(all.find((r) => r.node.id === "isolated")).toBeUndefined();
  });

  it("keeps only includeKinds", () => {
    const all = rankAllByDegree(nodes, edges, { includeKinds: ["element"] });
    expect(all.every((r) => r.node.kind === "element")).toBe(true);
  });

  it("returns every candidate without a limit", () => {
    const all = rankAllByDegree(nodes, edges);
    expect(all).toHaveLength(3);
    // The caller takes the top N with all.slice(0, N) and reports "top N of M".
    expect(all.slice(0, 1)).toHaveLength(1);
    expect(all.length).toBeGreaterThan(1);
  });
});

describe("computeDomainCouplingMatrix", () => {
  it("assigns nodes to domains and aggregates cross-domain connections", () => {
    const nodes = [
      node("project:app", "project"),
      node("domain:auth", "domain"),
      node("domain:billing", "domain"),
      node("capability:login", "capability"),
      node("capability:invoice", "capability"),
      node("element:token", "element"),
      node("document:note", "document"),
    ];
    const edges: KnowledgeGraphEdge[] = [
      { ...edge("e1", "project:app", "domain:auth"), type: "contains" },
      { ...edge("e2", "project:app", "domain:billing"), type: "contains" },
      { ...edge("e3", "domain:auth", "capability:login"), type: "contains" },
      { ...edge("e4", "domain:billing", "capability:invoice"), type: "contains" },
      { ...edge("e5", "capability:login", "element:token"), type: "contains" },
      { ...edge("e6", "capability:login", "capability:invoice"), type: "depends_on" },
      { ...edge("e7", "capability:invoice", "capability:login"), type: "related_to" },
      { ...edge("e8", "capability:login", "element:token"), type: "uses" },
    ];

    const matrix = computeDomainCouplingMatrix(nodes, edges);

    expect(matrix.domainCount).toBe(2);
    expect(matrix.assignedNodeCount).toBe(5);
    expect(matrix.unassignedNodeCount).toBe(2);
    expect(matrix.crossDomainEdgeCount).toBe(2);
    expect(matrix.selfDomainEdgeCount).toBe(1);
    expect(matrix.connections).toHaveLength(2);
    // When nothing is truncated, total === shown — the condition for hiding the caption.
    expect(matrix.totalConnectionCount).toBe(2);
    expect(matrix.connections[0]?.from.id).toBe("domain:auth");
    expect(matrix.connections[0]?.to.id).toBe("domain:billing");
    expect(matrix.connections[0]?.relationCounts).toEqual([{ type: "depends_on", count: 1 }]);
    expect(matrix.connections[0]?.examples[0]?.id).toBe("e6");
  });

  it("reports totalConnectionCount when connections are truncated", () => {
    const nodes = [
      node("domain:auth", "domain"),
      node("domain:billing", "domain"),
      node("domain:core", "domain"),
      node("capability:login", "capability"),
      node("capability:invoice", "capability"),
      node("capability:engine", "capability"),
    ];
    // Build 3 distinct directed cross-domain pairs (auth→billing, billing→core,
    // core→auth) and truncate at limit 2.
    const edges: KnowledgeGraphEdge[] = [
      { ...edge("c1", "domain:auth", "capability:login"), type: "contains" },
      { ...edge("c2", "domain:billing", "capability:invoice"), type: "contains" },
      { ...edge("c3", "domain:core", "capability:engine"), type: "contains" },
      { ...edge("e1", "capability:login", "capability:invoice"), type: "depends_on" },
      { ...edge("e2", "capability:invoice", "capability:engine"), type: "depends_on" },
      { ...edge("e3", "capability:engine", "capability:login"), type: "depends_on" },
    ];

    const matrix = computeDomainCouplingMatrix(nodes, edges, 2);

    expect(matrix.connections).toHaveLength(2);
    expect(matrix.totalConnectionCount).toBe(3);
  });

  it("leaves a node unassigned when its containment cycles", () => {
    const nodes = [
      node("domain:auth", "domain"),
      node("capability:login", "capability"),
      node("capability:session", "capability"),
    ];
    const edges: KnowledgeGraphEdge[] = [
      { ...edge("e1", "capability:session", "capability:login"), type: "contains" },
      { ...edge("e2", "capability:login", "capability:session"), type: "contains" },
      { ...edge("e3", "capability:login", "domain:auth"), type: "depends_on" },
    ];

    const matrix = computeDomainCouplingMatrix(nodes, edges);

    expect(matrix.assignedNodeCount).toBe(1);
    expect(matrix.unassignedNodeCount).toBe(2);
    expect(matrix.crossDomainEdgeCount).toBe(0);
  });

  it("narrows semantic coupling with the types option", () => {
    const nodes = [
      node("domain:auth", "domain"),
      node("domain:billing", "domain"),
      node("capability:login", "capability"),
      node("capability:invoice", "capability"),
    ];
    const edges: KnowledgeGraphEdge[] = [
      { ...edge("e1", "domain:auth", "capability:login"), type: "contains" },
      { ...edge("e2", "domain:billing", "capability:invoice"), type: "contains" },
      { ...edge("e3", "capability:login", "capability:invoice"), type: "depends_on" },
      { ...edge("e4", "capability:login", "capability:invoice"), type: "uses" },
      { ...edge("e5", "capability:invoice", "capability:login"), type: "related_to" },
    ];

    const matrix = computeDomainCouplingMatrix(nodes, edges, 10, {
      types: ["depends_on", "related_to"],
    });

    expect(matrix.crossDomainEdgeCount).toBe(2);
    expect(matrix.connections.map((row) => row.relationCounts)).toEqual([
      [{ type: "depends_on", count: 1 }],
      [{ type: "related_to", count: 1 }],
    ]);
  });
});

describe("selectRecentNodes", () => {
  it("sorts by lastApprovedAt descending with a limit", () => {
    const D1 = new Date("2026-04-20T00:00:00Z");
    const D2 = new Date("2026-04-25T00:00:00Z");
    const D3 = new Date("2026-04-27T00:00:00Z");
    const result = selectRecentNodes(
      [node("a", "capability", D1), node("b", "capability", D2), node("c", "capability", D3)],
      2,
    );
    expect(result).toHaveLength(2);
    expect(result[0]?.id).toBe("c");
    expect(result[1]?.id).toBe("b");
  });

  it("breaks timestamp ties by title ascending", () => {
    const sameDate = new Date("2026-04-27T00:00:00Z");
    const result = selectRecentNodes([
      node("zebra", "capability", sameDate),
      node("apple", "capability", sameDate),
    ]);
    expect(result[0]?.id).toBe("apple");
    expect(result[1]?.id).toBe("zebra");
  });
});
