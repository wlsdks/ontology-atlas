import { describe, expect, it } from "vitest";
import type { KnowledgeGraphEdge, KnowledgeGraphNode } from "@/entities/knowledge-graph";
import { computeDomainCapacityRows } from "./domain-capacity";

function node(id: string, kind: string, title = id): KnowledgeGraphNode {
  return {
    id,
    title,
    kind,
    projectIds: [],
    evidenceIds: [],
    lastApprovedAt: new Date(0),
    lastApprovedBy: "vault-frontmatter",
  };
}

function edge(from: string, to: string, type = "contains"): KnowledgeGraphEdge {
  return { from, to, type } as KnowledgeGraphEdge;
}

// Guardian I-1 — 그래프 BFS 진실원 계약 (구 tree-roots 워크 시그니처는 은퇴).
describe("computeDomainCapacityRows", () => {
  it("counts capability + element descendants per domain, sorted by total desc", () => {
    const nodes = [
      node("project:atlas", "project"),
      node("domain:views", "domain", "Views"),
      node("capability:a", "capability"),
      node("capability:b", "capability"),
      node("element:a1", "element"),
      node("element:a2", "element"),
      node("domain:core", "domain", "Ontology Core"),
      node("capability:c", "capability"),
    ];
    const edges = [
      edge("project:atlas", "domain:views"),
      edge("domain:views", "capability:a"),
      edge("domain:views", "capability:b"),
      edge("capability:b", "element:a1"),
      edge("capability:b", "element:a2"),
      edge("project:atlas", "domain:core"),
      edge("domain:core", "capability:c"),
    ];

    const rows = computeDomainCapacityRows(nodes, edges);

    expect(rows).toEqual([
      { id: "domain:views", title: "Views", capabilityCount: 2, elementCount: 2, total: 4 },
      { id: "domain:core", title: "Ontology Core", capabilityCount: 1, elementCount: 0, total: 1 },
    ]);
  });

  it("returns an empty array when there are no domain nodes", () => {
    expect(computeDomainCapacityRows([node("project:atlas", "project")], [])).toEqual([]);
  });

  it("다중 부모 노드도 도메인마다 집계된다 (트리 단일-부모 유실 회귀)", () => {
    const nodes = [
      node("domain:a", "domain", "A"),
      node("domain:b", "domain", "B"),
      node("capability:c", "capability"),
      node("element:e", "element"),
    ];
    const edges = [
      edge("domain:a", "capability:c"),
      edge("capability:c", "element:e"),
      edge("domain:b", "element:e"),
    ];
    const rows = computeDomainCapacityRows(nodes, edges);
    expect(rows).toEqual([
      { id: "domain:a", title: "A", capabilityCount: 1, elementCount: 1, total: 2 },
      { id: "domain:b", title: "B", capabilityCount: 0, elementCount: 1, total: 1 },
    ]);
  });

  it("breaks ties by title ascending for determinism", () => {
    const nodes = [
      node("domain:b", "domain", "Zeta"),
      node("domain:a", "domain", "Alpha"),
      node("capability:z", "capability"),
      node("capability:a", "capability"),
    ];
    const edges = [edge("domain:b", "capability:z"), edge("domain:a", "capability:a")];
    const rows = computeDomainCapacityRows(nodes, edges);
    expect(rows.map((r) => r.title)).toEqual(["Alpha", "Zeta"]);
  });
});
