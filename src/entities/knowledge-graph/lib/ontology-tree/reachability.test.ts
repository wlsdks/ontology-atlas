import { describe, expect, it } from "vitest";
import type { KnowledgeGraphEdge, KnowledgeGraphNode } from "../../model";
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

  it("skips relation types listed in excludeTypes", () => {
    // start → a (depends_on), start → b (related_to): impact excludes related_to.
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

    // Without the exclusion both are reachable.
    const all = buildOntologyReachability("start", nodes, edges, {});
    expect(all.summary.reachableNodes).toBe(2);
  });

  it("cuts a transitive path at an excluded type", () => {
    // start →(depends_on) a →(related_to) b: excluding related_to makes b unreachable.
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

  it("keeps BFS distance order on a deep chain", () => {
    // A straight chain: the head-pointer BFS must still dequeue FIFO, so each node lands at its hop.
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

// Dependents: the incoming transitive closure without soft associations; the drawer and change
// diff share it so their numbers agree.
describe("computeOntologyDependents", () => {
  // a depends_on b depends_on c, so c has 2 dependents.
  const chain = [node("a"), node("b"), node("c")];
  const chainEdges = [edge("e1", "a", "b"), edge("e2", "b", "c")];

  it("counts the transitive incoming closure", () => {
    expect(computeOntologyDependents("c", chain, chainEdges)).toBe(2);
    expect(computeOntologyDependents("b", chain, chainEdges)).toBe(1);
    expect(computeOntologyDependents("a", chain, chainEdges)).toBe(0); // Nobody depends on a.
  });

  it("excludes related_to associations", () => {
    const nodes = [node("x"), node("y")];
    // y related_to x is outside the blast radius.
    const edges = [edge("r", "y", "x", "related_to")];
    expect(computeOntologyDependents("x", nodes, edges)).toBe(0);
  });

  it("counts depends_on edges", () => {
    const nodes = [node("x"), node("y")];
    const edges = [edge("d", "y", "x", "depends_on")];
    expect(computeOntologyDependents("x", nodes, edges)).toBe(1);
  });

  it("does not count structural edges as dependency impact", () => {
    const nodes = [node("project", "project"), node("domain", "domain"), node("target")];
    const edges = [
      edge("c1", "project", "domain", "contains"),
      edge("c2", "domain", "target", "capabilities"),
    ];
    expect(computeOntologyDependents("target", nodes, edges)).toBe(0);
    expect(computeOntologyDependents("domain", nodes, edges)).toBe(0);
  });

  it("counts 0 for an isolated node", () => {
    expect(computeOntologyDependents("solo", [node("solo")], [])).toBe(0);
  });

  it("matches the drawer count", () => {
    // Must equal the drawer's reach.dependents from `buildOntologyReachability`.
    const direct = buildOntologyReachability("c", chain, chainEdges, {
      direction: "incoming",
      depth: chain.length,
      limit: 1,
      types: ["depends_on"],
    }).summary.reachableNodes;
    expect(computeOntologyDependents("c", chain, chainEdges)).toBe(direct);
  });
});
