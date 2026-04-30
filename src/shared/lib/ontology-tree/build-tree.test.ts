import { describe, expect, it } from "vitest";
import { buildOntologyTree, countTreeNodes, flattenTree } from "./build-tree";
import type {
  KnowledgeGraphEdge,
  KnowledgeGraphNode,
} from "@/entities/knowledge-graph";

function makeNode(
  id: string,
  kind: string,
  title?: string,
): KnowledgeGraphNode {
  return {
    id,
    title: title ?? id,
    kind,
    projectIds: [],
    evidenceIds: [],
    lastApprovedAt: new Date("2026-04-27"),
    lastApprovedBy: "system",
  };
}

function makeEdge(
  id: string,
  from: string,
  to: string,
  type: string,
): KnowledgeGraphEdge {
  return {
    id,
    from,
    to,
    type,
    projectIds: [],
    evidenceIds: [],
    lastApprovedAt: new Date("2026-04-27"),
    lastApprovedBy: "system",
  };
}

describe("buildOntologyTree — happy path", () => {
  const nodes = [
    makeNode("p1", "project", "Aslan Maps"),
    makeNode("d1", "domain", "인증"),
    makeNode("d2", "domain", "지식"),
    makeNode("c1", "capability", "로그인"),
    makeNode("c2", "capability", "검수"),
    makeNode("e1", "element", "LoginAction"),
    makeNode("e2", "element", "ReviewWorkspace"),
    makeNode("doc1", "document", "spec.md"), // should be excluded
  ];
  const edges = [
    makeEdge("e-p1-d1", "p1", "d1", "contains"),
    makeEdge("e-p1-d2", "p1", "d2", "contains"),
    makeEdge("e-d1-c1", "d1", "c1", "contains"),
    makeEdge("e-d2-c2", "d2", "c2", "contains"),
    makeEdge("e-c1-e1", "c1", "e1", "contains"),
    makeEdge("e-c2-e2", "c2", "e2", "contains"),
    makeEdge("e-doc1-c1", "doc1", "c1", "describes"), // should be ignored
  ];

  it("excludes document-kind nodes from tree", () => {
    const result = buildOntologyTree(nodes, edges);
    const flat = flattenTree(result.roots);
    expect(flat.find((t) => t.node.id === "doc1")).toBeUndefined();
  });

  it("makes project the root", () => {
    const result = buildOntologyTree(nodes, edges);
    expect(result.roots).toHaveLength(1);
    expect(result.roots[0]!.node.id).toBe("p1");
    expect(result.roots[0]!.depth).toBe(0);
  });

  it("nests domain → capability → element", () => {
    const result = buildOntologyTree(nodes, edges);
    const root = result.roots[0]!;
    // Project has 2 domains
    expect(root.children).toHaveLength(2);
    // 인증 / 지식 알파벳 정렬
    expect(root.children.map((c) => c.node.id).sort()).toEqual(["d1", "d2"]);
    const d1 = root.children.find((c) => c.node.id === "d1")!;
    expect(d1.children).toHaveLength(1);
    expect(d1.children[0]!.node.id).toBe("c1");
    expect(d1.children[0]!.depth).toBe(2);
    const c1 = d1.children[0]!;
    expect(c1.children).toHaveLength(1);
    expect(c1.children[0]!.node.id).toBe("e1");
    expect(c1.children[0]!.depth).toBe(3);
  });

  it("countTreeNodes counts all non-document nodes", () => {
    const result = buildOntologyTree(nodes, edges);
    // p1, d1, d2, c1, c2, e1, e2 = 7
    expect(countTreeNodes(result.roots)).toBe(7);
  });

  it("flattenTree returns DFS order for indented display", () => {
    const result = buildOntologyTree(nodes, edges);
    const ids = flattenTree(result.roots).map((t) => t.node.id);
    expect(ids).toEqual(["p1", "d1", "c1", "e1", "d2", "c2", "e2"]);
  });

  it("no orphans / no warnings for clean data", () => {
    const result = buildOntologyTree(nodes, edges);
    expect(result.orphans).toEqual([]);
    expect(result.warnings).toEqual([]);
  });
});

describe("buildOntologyTree — belongs_to is reverse of contains", () => {
  it("treats belongs_to from→to as child→parent", () => {
    const nodes = [
      makeNode("p1", "project"),
      makeNode("d1", "domain"),
    ];
    const edges = [makeEdge("e1", "d1", "p1", "belongs_to")];
    const result = buildOntologyTree(nodes, edges);
    expect(result.roots).toHaveLength(1);
    expect(result.roots[0]!.node.id).toBe("p1");
    expect(result.roots[0]!.children[0]!.node.id).toBe("d1");
  });
});

describe("buildOntologyTree — error handling", () => {
  it("warns and ignores self-parent edge", () => {
    const nodes = [makeNode("p1", "project")];
    const edges = [makeEdge("e", "p1", "p1", "contains")];
    const result = buildOntologyTree(nodes, edges);
    expect(result.warnings.some((w) => w.includes("self-parent"))).toBe(true);
    expect(result.roots).toHaveLength(1);
    expect(result.roots[0]!.node.id).toBe("p1");
  });

  it("warns on duplicate parent — keeps first", () => {
    const nodes = [
      makeNode("p1", "project"),
      makeNode("p2", "project"),
      makeNode("d1", "domain"),
    ];
    const edges = [
      makeEdge("e1", "p1", "d1", "contains"),
      makeEdge("e2", "p2", "d1", "contains"),
    ];
    const result = buildOntologyTree(nodes, edges);
    expect(result.warnings.some((w) => w.includes("multiple parents"))).toBe(true);
    // d1 should be under either p1 or p2 (first wins by edge order — p1)
    const p1 = result.roots.find((r) => r.node.id === "p1")!;
    expect(p1.children.find((c) => c.node.id === "d1")).toBeTruthy();
  });

  it("breaks cycles", () => {
    const nodes = [
      makeNode("a", "domain"),
      makeNode("b", "domain"),
      makeNode("c", "domain"),
    ];
    const edges = [
      makeEdge("e1", "a", "b", "contains"),
      makeEdge("e2", "b", "c", "contains"),
      makeEdge("e3", "c", "a", "contains"), // cycle!
    ];
    const result = buildOntologyTree(nodes, edges);
    expect(result.warnings.some((w) => w.includes("cycle"))).toBe(true);
    // Some node should be promoted to root.
    expect(result.roots.length).toBeGreaterThanOrEqual(1);
  });

  it("ignores edges referencing non-existent nodes", () => {
    const nodes = [makeNode("p1", "project")];
    const edges = [makeEdge("e1", "ghost", "p1", "contains")];
    const result = buildOntologyTree(nodes, edges);
    expect(result.roots).toHaveLength(1);
    expect(result.warnings).toEqual([]);
  });
});

describe("buildOntologyTree — empty / sparse input", () => {
  it("returns empty result for empty input", () => {
    const result = buildOntologyTree([], []);
    expect(result.roots).toEqual([]);
    expect(result.orphans).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it("makes everything a root if no contains/belongs_to edges", () => {
    const nodes = [
      makeNode("p1", "project"),
      makeNode("d1", "domain"),
      makeNode("c1", "capability"),
    ];
    const result = buildOntologyTree(nodes, []);
    expect(result.roots).toHaveLength(3);
  });
});

describe("compareNodes — sorting", () => {
  it("orders kinds: project > domain > capability > element", () => {
    const nodes = [
      makeNode("e1", "element", "Z element"),
      makeNode("d1", "domain", "Z domain"),
      makeNode("p1", "project", "A project"),
      makeNode("c1", "capability", "A capability"),
    ];
    const result = buildOntologyTree(nodes, []);
    const ids = result.roots.map((r) => r.node.id);
    expect(ids).toEqual(["p1", "d1", "c1", "e1"]);
  });

  it("breaks ties with title alphabetical", () => {
    const nodes = [
      makeNode("p1", "project", "Z 프로젝트"),
      makeNode("p2", "project", "A 프로젝트"),
    ];
    const result = buildOntologyTree(nodes, []);
    expect(result.roots[0]!.node.id).toBe("p2");
    expect(result.roots[1]!.node.id).toBe("p1");
  });
});
