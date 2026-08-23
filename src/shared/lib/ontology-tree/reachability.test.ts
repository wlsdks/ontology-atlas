import { describe, expect, it } from "vitest";
import type { KnowledgeGraphEdge, KnowledgeGraphNode } from "@/entities/knowledge-graph";
import { buildOntologyReachability, computeOntologyDependents } from "./reachability";

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
    // start → a (depends_on), start → b (related_to). Impact must exclude
    // related_to: a soft association is not a dependency, so it is outside the
    // blast radius.
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

    // Without the exclusion both are reachable — the baseline to compare against.
    const all = buildOntologyReachability("start", nodes, edges, {});
    expect(all.summary.reachableNodes).toBe(2);
  });

  it("excludeTypes 가 transitive 경로를 끊는다 (체인 중간 related_to)", () => {
    // start →(depends_on) a →(related_to) b. Excluding related_to makes b unreachable.
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
    // A straight chain start → n1 → n2 → n3 → n4. Checks that the head-pointer
    // BFS still dequeues FIFO, so every node lands in the layer at its exact hop
    // distance.
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

// Blast radius = how many nodes depend on this one, directly or transitively =
// the incoming transitive closure with soft associations (related_to, describes)
// excluded. The drawer and the change diff call the *same* function so their
// numbers cannot drift apart.
describe("computeOntologyDependents", () => {
  // a depends_on b depends_on c: changing c affects b and a, so c has 2 dependents.
  const chain = [node("a"), node("b"), node("c")];
  const chainEdges = [edge("e1", "a", "b"), edge("e2", "b", "c")];

  it("전이 incoming closure 를 센다 (체인 끝 = 모든 상류)", () => {
    expect(computeOntologyDependents("c", chain, chainEdges)).toBe(2); // b, a
    expect(computeOntologyDependents("b", chain, chainEdges)).toBe(1); // a
    expect(computeOntologyDependents("a", chain, chainEdges)).toBe(0); // No one depends on a
  });

  it("soft association(related_to)은 의존이 아니라 제외", () => {
    const nodes = [node("x"), node("y")];
    // y related_to x — related_to is outside the blast radius, so x has 0 dependents.
    const edges = [edge("r", "y", "x", "related_to")];
    expect(computeOntologyDependents("x", nodes, edges)).toBe(0);
  });

  it("의존 엣지는 센다 (depends_on)", () => {
    const nodes = [node("x"), node("y")];
    const edges = [edge("d", "y", "x", "depends_on")]; // y depends_on x
    expect(computeOntologyDependents("x", nodes, edges)).toBe(1); // y
  });

  it("contains/domain/elements 구조 엣지는 의존 영향으로 세지 않는다", () => {
    const nodes = [node("project", "project"), node("domain", "domain"), node("target")];
    const edges = [
      edge("c1", "project", "domain", "contains"),
      edge("c2", "domain", "target", "capabilities"),
    ];
    expect(computeOntologyDependents("target", nodes, edges)).toBe(0);
    expect(computeOntologyDependents("domain", nodes, edges)).toBe(0);
  });

  it("고립 노드 = 0", () => {
    expect(computeOntologyDependents("solo", [node("solo")], [])).toBe(0);
  });

  it("drawer 와 동일 수 — 같은 함수 source (can't drift)", () => {
    // Must equal the drawer's reach.dependents exactly — i.e. what
    // buildOntologyReachability computes with incoming/fullDepth/exclude.
    const direct = buildOntologyReachability("c", chain, chainEdges, {
      direction: "incoming",
      depth: chain.length,
      limit: 1,
      types: ["depends_on"],
    }).summary.reachableNodes;
    expect(computeOntologyDependents("c", chain, chainEdges)).toBe(direct);
  });
});
