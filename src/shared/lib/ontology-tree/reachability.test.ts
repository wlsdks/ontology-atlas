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
});
