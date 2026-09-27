import { describe, expect, it } from "vitest";
import type { KnowledgeGraphEdge, KnowledgeGraphNode } from "@/entities/knowledge-graph";
import { findDependencyCycles, isDependencyEdgeType } from "./dependency-cycles";

function n(id: string): KnowledgeGraphNode {
  return {
    id,
    title: id,
    kind: "capability",
    projectIds: [],
    evidenceIds: [id.replace(":", "s/")],
    lastApprovedAt: new Date(0),
    lastApprovedBy: "vault-frontmatter",
  } as KnowledgeGraphNode;
}

function e(from: string, to: string, type = "depends_on"): KnowledgeGraphEdge {
  return { from, to, type } as KnowledgeGraphEdge;
}

/** Builds a node array from a list of ids. */
function nodes(...ids: string[]): KnowledgeGraphNode[] {
  return ids.map(n);
}

describe("isDependencyEdgeType", () => {
  it("treats only depends_on and dependencies as dependency relations, like the MCP cycle derivation", () => {
    expect(isDependencyEdgeType("depends_on")).toBe(true);
    expect(isDependencyEdgeType("dependencies")).toBe(true);
  });

  it("does not treat containment or other relations as dependencies", () => {
    for (const t of ["contains", "belongs_to", "relates", "related_to", "implements", "uses", "describes"]) {
      expect(isDependencyEdgeType(t)).toBe(false);
    }
  });
});

describe("findDependencyCycles", () => {
  it("returns no cycle for an acyclic dependency chain", () => {
    const g = nodes("c:a", "c:b", "c:c");
    const edges = [e("c:a", "c:b"), e("c:b", "c:c")];
    const result = findDependencyCycles(g, edges);
    expect(result.cycles).toEqual([]);
    expect(result.totalCycles).toBe(0);
    expect(result.hiddenCycles).toBe(0);
    expect(result.activeCycleIds).toEqual([]);
  });

  it("returns no cycle for a containment loop", () => {
    const g = nodes("c:a", "c:b");
    // A loop through `contains` only → ignored.
    const edges = [e("c:a", "c:b", "contains"), e("c:b", "c:a", "belongs_to")];
    expect(findDependencyCycles(g, edges).totalCycles).toBe(0);
  });

  it("finds A→B→C→A as one directed cycle", () => {
    const g = nodes("c:a", "c:b", "c:c");
    const edges = [e("c:a", "c:b"), e("c:b", "c:c"), e("c:c", "c:a")];
    const result = findDependencyCycles(g, edges);
    expect(result.totalCycles).toBe(1);
    const cycle = result.cycles[0];
    expect(cycle.length).toBe(3);
    expect(cycle.nodeIds).toEqual(["c:a", "c:b", "c:c"]);
    expect(cycle.hiddenNodeCount).toBe(0);
  });

  it("folds rotations of one cycle regardless of the start node", () => {
    const g = nodes("c:a", "c:b", "c:c");
    // One cycle in one direction stays one, however many entry points exist.
    const edges = [e("c:b", "c:c"), e("c:c", "c:a"), e("c:a", "c:b")];
    expect(findDependencyCycles(g, edges).totalCycles).toBe(1);
  });

  it("finds a self-dependency as a cycle of length 1", () => {
    const g = nodes("c:a", "c:b");
    const edges = [e("c:a", "c:a"), e("c:a", "c:b")];
    const result = findDependencyCycles(g, edges);
    expect(result.totalCycles).toBe(1);
    expect(result.cycles[0].nodeIds).toEqual(["c:a"]);
    expect(result.cycles[0].length).toBe(1);
  });

  it("finds two cycles that share a node separately", () => {
    // a→b→a (a 2-cycle) and a→b→c→a (a 3-cycle) share nodes a and b.
    const g = nodes("c:a", "c:b", "c:c");
    const edges = [e("c:a", "c:b"), e("c:b", "c:a"), e("c:b", "c:c"), e("c:c", "c:a")];
    const result = findDependencyCycles(g, edges);
    expect(result.totalCycles).toBe(2);
    // Sorted shortest first.
    expect(result.cycles[0].length).toBe(2);
    expect(result.cycles[1].length).toBe(3);
  });

  it("shows five cycles and counts the rest in hiddenCycles", () => {
    // Eight distinct cycles returning through the shared `hub` node.
    const g = nodes("c:hub", ...Array.from({ length: 8 }, (_, i) => `c:n${i}`));
    const edges: KnowledgeGraphEdge[] = [];
    for (let i = 0; i < 8; i++) {
      edges.push(e("c:hub", `c:n${i}`));
      edges.push(e(`c:n${i}`, "c:hub"));
    }
    const result = findDependencyCycles(g, edges);
    expect(result.totalCycles).toBe(8);
    expect(result.cycles.length).toBe(5);
    expect(result.hiddenCycles).toBe(3);
    expect(result.activeCycleIds).toHaveLength(8);
  });

  it("lists eight nodes of a longer cycle and counts the rest in hiddenNodeCount", () => {
    // A single 10-node cycle.
    const ids = Array.from({ length: 10 }, (_, i) => `c:p${i}`);
    const g = nodes(...ids);
    const edges = ids.map((id, i) => e(id, ids[(i + 1) % ids.length]));
    const result = findDependencyCycles(g, edges, { maxHops: 12 });
    expect(result.totalCycles).toBe(1);
    const cycle = result.cycles[0];
    expect(cycle.length).toBe(10);
    expect(cycle.nodeIds).toHaveLength(8);
    expect(cycle.hiddenNodeCount).toBe(2);
  });

  it("ignores a dependency edge whose endpoint is not a node", () => {
    const g = nodes("c:a", "c:b");
    const edges = [e("c:a", "c:b"), e("c:b", "c:ghost"), e("c:ghost", "c:a")];
    expect(findDependencyCycles(g, edges).totalCycles).toBe(0);
  });
});
