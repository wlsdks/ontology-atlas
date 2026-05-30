import { describe, expect, it } from "vitest";
import type { KnowledgeGraphEdge, KnowledgeGraphNode } from "@/entities/knowledge-graph";
import { buildOntologyReachability } from "./reachability";

const APPROVED_AT = new Date("2026-04-27T00:00:00Z");

function node(id: string, kind = "capability"): KnowledgeGraphNode {
  return {
    id,
    title: id.toUpperCase(),
    kind,
    projectIds: [],
    evidenceIds: [],
    lastApprovedAt: APPROVED_AT,
    lastApprovedBy: "test",
  };
}

function edge(id: string, from: string, to: string, type = "depends_on"): KnowledgeGraphEdge {
  return {
    id,
    from,
    to,
    type,
    projectIds: [],
    evidenceIds: [],
    lastApprovedAt: APPROVED_AT,
    lastApprovedBy: "test",
  };
}

describe("buildOntologyReachability", () => {
  it("groups reachable nodes by BFS layer and counts relation kinds", () => {
    const nodes = [
      node("start"),
      node("domain", "domain"),
      node("cap-a"),
      node("element-a", "element"),
      node("incoming"),
    ];
    const edges = [
      edge("e1", "start", "domain", "domain"),
      edge("e2", "domain", "cap-a", "contains"),
      edge("e3", "cap-a", "element-a", "elements"),
      edge("e4", "incoming", "start", "relates"),
    ];

    const result = buildOntologyReachability("start", nodes, edges, {
      direction: "outgoing",
      depth: 3,
    });

    expect(result.summary).toEqual({
      reachableNodes: 3,
      traversedEdges: 3,
      layers: 3,
      terminalNodes: 1,
    });
    expect(result.layers.map((layer) => [layer.distance, layer.nodes.map((n) => n.id)])).toEqual([
      [1, ["domain"]],
      [2, ["cap-a"]],
      [3, ["element-a"]],
    ]);
    expect(result.byKind).toEqual({ domain: 1, capability: 1, element: 1 });
    expect(result.byRelation).toEqual({ domain: 1, contains: 1, elements: 1 });
    expect(result.terminalNodes.map((n) => n.id)).toEqual(["element-a"]);
  });

  it("supports incoming and both-direction traversals without revisiting the start node", () => {
    const nodes = [node("start"), node("incoming"), node("outgoing"), node("far")];
    const edges = [
      edge("e1", "incoming", "start", "relates"),
      edge("e2", "start", "outgoing", "depends_on"),
      edge("e3", "incoming", "far", "contains"),
    ];

    expect(
      buildOntologyReachability("start", nodes, edges, { direction: "incoming", depth: 2 })
        .layers.map((layer) => layer.nodes.map((n) => n.id)),
    ).toEqual([["incoming"]]);

    expect(
      buildOntologyReachability("start", nodes, edges, { direction: "both", depth: 1 })
        .layers[0]?.nodes.map((n) => n.id),
    ).toEqual(["incoming", "outgoing"]);
  });

  it("honors relation type filters and visible node limits", () => {
    const nodes = [node("start"), node("a"), node("b")];
    const edges = [
      edge("e1", "start", "a", "depends_on"),
      edge("e2", "start", "b", "relates"),
    ];

    const filtered = buildOntologyReachability("start", nodes, edges, {
      types: ["relates"],
      limit: 1,
    });

    expect(filtered.summary.reachableNodes).toBe(1);
    expect(filtered.layers[0]?.nodes.map((n) => n.id)).toEqual(["b"]);
    expect(filtered.byRelation).toEqual({ relates: 1 });
    expect(filtered.limited).toBe(false);
  });

  it("excludeTypes 로 특정 관계 타입을 traversal 에서 제외 (impact blast-radius 용)", () => {
    // start → a (depends_on), start → b (related_to). impact 에서 related_to
    // (soft association) 는 제외해야 — "relates to" 는 의존이 아니므로 blast
    // radius 에 안 들어간다.
    const nodes = [node("start"), node("a"), node("b")];
    const edges = [
      edge("e1", "start", "a", "depends_on"),
      edge("e2", "start", "b", "related_to"),
    ];

    const excluded = buildOntologyReachability("start", nodes, edges, {
      excludeTypes: ["related_to"],
    });
    expect(excluded.summary.reachableNodes).toBe(1);
    expect(excluded.layers[0]?.nodes.map((n) => n.id)).toEqual(["a"]);
    expect(excluded.byRelation).toEqual({ depends_on: 1 });

    // 제외 안 하면 둘 다 도달 — 대비(baseline).
    const all = buildOntologyReachability("start", nodes, edges, {});
    expect(all.summary.reachableNodes).toBe(2);
  });

  it("excludeTypes 가 transitive 경로를 끊는다 (체인 중간 related_to)", () => {
    // start →(depends_on) a →(related_to) b. related_to 제외 시 b 는 도달 불가.
    const nodes = [node("start"), node("a"), node("b")];
    const edges = [
      edge("e1", "start", "a", "depends_on"),
      edge("e2", "a", "b", "related_to"),
    ];
    const excluded = buildOntologyReachability("start", nodes, edges, {
      excludeTypes: ["related_to"],
      depth: 5,
    });
    expect(excluded.layers.flatMap((l) => l.nodes.map((n) => n.id))).toEqual(["a"]);
  });

  it("깊은 체인에서 BFS distance 순서 보존 (head-pointer dequeue 회귀 가드)", () => {
    // start → n1 → n2 → n3 → n4 일직선 체인. head pointer 로 바꾼 BFS 가
    // FIFO(breadth-first) 순서를 유지하는지 — 각 노드가 정확한 hop 거리의
    // 레이어에 들어가야 한다.
    const nodes = ["start", "n1", "n2", "n3", "n4"].map((id) => node(id));
    const edges = [
      edge("e1", "start", "n1"),
      edge("e2", "n1", "n2"),
      edge("e3", "n2", "n3"),
      edge("e4", "n3", "n4"),
    ];
    const result = buildOntologyReachability("start", nodes, edges, { depth: 4 });
    expect(
      result.layers.map((layer) => [layer.distance, layer.nodes.map((n) => n.id)]),
    ).toEqual([
      [1, ["n1"]],
      [2, ["n2"]],
      [3, ["n3"]],
      [4, ["n4"]],
    ]);
  });
});
