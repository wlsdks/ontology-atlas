import { describe, expect, it } from "vitest";
import type { KnowledgeGraphEdge, KnowledgeGraphNode } from "../../model";
import { buildOntologyEgoSubgraph } from "./build-ego";

const APPROVED_AT = new Date("2026-04-27T00:00:00Z");

function node(id: string, title = id): KnowledgeGraphNode {
  return {
    id,
    title,
    kind: "capability",
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

describe("buildOntologyEgoSubgraph", () => {
  it("lists outgoing before incoming, keeping input order within each", () => {
    const center = node("auth-login");
    const a = node("iam");
    const b = node("session");
    const c = node("public-api");
    const nodes = [center, a, b, c];
    const edges = [
      edge("e1", "auth-login", "iam"), // outgoing
      edge("e2", "session", "auth-login"), // incoming
      edge("e3", "auth-login", "public-api"), // outgoing
    ];
    const result = buildOntologyEgoSubgraph("auth-login", nodes, edges);
    expect(result.centerId).toBe("auth-login");
    expect(result.neighbors).toHaveLength(3);
    expect(result.neighbors[0]?.direction).toBe("outgoing");
    expect(result.neighbors[0]?.neighborId).toBe("iam");
    expect(result.neighbors[1]?.direction).toBe("outgoing");
    expect(result.neighbors[1]?.neighborId).toBe("public-api");
    expect(result.neighbors[2]?.direction).toBe("incoming");
    expect(result.neighbors[2]?.neighborId).toBe("session");
  });

  it("excludes self-loops", () => {
    const center = node("self");
    const result = buildOntologyEgoSubgraph(
      "self",
      [center],
      [edge("loop", "self", "self")],
    );
    expect(result.neighbors).toHaveLength(0);
  });

  it("keeps two entries for a neighbor linked both ways", () => {
    const center = node("a");
    const b = node("b");
    const nodes = [center, b];
    const edges = [edge("e1", "a", "b", "uses"), edge("e2", "b", "a", "describes")];
    const result = buildOntologyEgoSubgraph("a", nodes, edges);
    expect(result.neighbors).toHaveLength(2);
    expect(result.neighbors[0]?.direction).toBe("outgoing");
    expect(result.neighbors[0]?.edge.type).toBe("uses");
    expect(result.neighbors[1]?.direction).toBe("incoming");
    expect(result.neighbors[1]?.edge.type).toBe("describes");
  });

  it("keeps neighborId with node null for a missing neighbor", () => {
    const center = node("a");
    const result = buildOntologyEgoSubgraph(
      "a",
      [center],
      [edge("orphan-edge", "a", "ghost")],
    );
    expect(result.neighbors).toHaveLength(1);
    expect(result.neighbors[0]?.node).toBeNull();
    expect(result.neighbors[0]?.neighborId).toBe("ghost");
  });

  it("returns no neighbors for a missing centerId", () => {
    const result = buildOntologyEgoSubgraph("nope", [node("a")], [edge("e", "a", "a")]);
    expect(result.neighbors).toHaveLength(0);
  });

  it("returns only 1-hop results by default", () => {
    const center = node("c");
    const a = node("a");
    const b = node("b");
    const result = buildOntologyEgoSubgraph(
      "c",
      [center, a, b],
      [edge("e1", "c", "a"), edge("e2", "a", "b")],
    );
    expect(result.neighbors).toHaveLength(1);
    expect(result.neighbors[0]?.hop).toBe(1);
    expect(result.neighbors[0]?.neighborId).toBe("a");
  });
});

describe("buildOntologyEgoSubgraph — hops=2", () => {
  it("includes 1-hop and 2-hop neighbors with a hop field", () => {
    const center = node("c");
    const a = node("a");
    const b = node("b");
    const result = buildOntologyEgoSubgraph(
      "c",
      [center, a, b],
      [edge("e1", "c", "a"), edge("e2", "a", "b")],
      { hops: 2 },
    );
    expect(result.neighbors).toHaveLength(2);
    expect(result.neighbors[0]?.hop).toBe(1);
    expect(result.neighbors[0]?.neighborId).toBe("a");
    expect(result.neighbors[1]?.hop).toBe(2);
    expect(result.neighbors[1]?.neighborId).toBe("b");
    expect(result.neighbors[1]?.viaNeighborId).toBe("a");
  });

  it("excludes a 2-hop edge back to the center", () => {
    const center = node("c");
    const a = node("a");
    const result = buildOntologyEgoSubgraph(
      "c",
      [center, a],
      [edge("e1", "c", "a"), edge("e2", "a", "c")],
      { hops: 2 },
    );
    // hop 1 both ways; nothing at hop 2 since a→c returns to the center.
    expect(result.neighbors).toHaveLength(2);
    expect(result.neighbors.every((n) => n.hop === 1)).toBe(true);
  });

  it("does not repeat a 1-hop neighbor at 2 hops", () => {
    const center = node("c");
    const a = node("a");
    const b = node("b");
    const result = buildOntologyEgoSubgraph(
      "c",
      [center, a, b],
      [
        edge("e1", "c", "a"),
        edge("e2", "c", "b"), // b is hop 1.
        edge("e3", "a", "b"), // Skipped: b is already hop 1.
      ],
      { hops: 2 },
    );
    expect(result.neighbors).toHaveLength(2);
    expect(result.neighbors.every((n) => n.hop === 1)).toBe(true);
  });

  it("follows incoming edges at 2 hops", () => {
    const center = node("c");
    const a = node("a");
    const b = node("b");
    const result = buildOntologyEgoSubgraph(
      "c",
      [center, a, b],
      [edge("e1", "c", "a"), edge("e2", "b", "a")], // b→a: a is hop 1, b is a hop-2 incoming neighbor.
      { hops: 2 },
    );
    const hop2 = result.neighbors.filter((n) => n.hop === 2);
    expect(hop2).toHaveLength(1);
    expect(hop2[0]?.neighborId).toBe("b");
    expect(hop2[0]?.direction).toBe("incoming");
    expect(hop2[0]?.viaNeighborId).toBe("a");
  });

  it("keeps neighborId with node null for a missing 2-hop node", () => {
    const center = node("c");
    const a = node("a");
    const result = buildOntologyEgoSubgraph(
      "c",
      [center, a],
      [edge("e1", "c", "a"), edge("e2", "a", "ghost")],
      { hops: 2 },
    );
    const hop2 = result.neighbors.filter((n) => n.hop === 2);
    expect(hop2).toHaveLength(1);
    expect(hop2[0]?.node).toBeNull();
    expect(hop2[0]?.neighborId).toBe("ghost");
  });

  it("does not pivot through a 1-hop stub", () => {
    const center = node("c");
    const result = buildOntologyEgoSubgraph(
      "c",
      [center],
      [edge("e1", "c", "ghost"), edge("e2", "ghost", "far")],
      { hops: 2 },
    );
    // The missing node is not traversed at hop 2.
    expect(result.neighbors).toHaveLength(1);
    expect(result.neighbors[0]?.hop).toBe(1);
    expect(result.neighbors[0]?.neighborId).toBe("ghost");
  });
});
