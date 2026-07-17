import { describe, expect, it } from "vitest";
import type {
  KnowledgeGraphEdge,
  KnowledgeGraphNode,
} from "@/entities/knowledge-graph";
import { buildTopologyV2Graph } from "./topology-v2-adapter";

function node(extra: Partial<KnowledgeGraphNode> = {}): KnowledgeGraphNode {
  return {
    id: "domain:auth",
    title: "Auth",
    kind: "domain",
    projectIds: ["ontology-atlas"],
    evidenceIds: [],
    lastApprovedAt: new Date("2026-01-01T00:00:00Z"),
    lastApprovedBy: "stark",
    ...extra,
  };
}

function edge(extra: Partial<KnowledgeGraphEdge> = {}): KnowledgeGraphEdge {
  return {
    id: "e:1",
    from: "project:ontology-atlas",
    to: "domain:auth",
    type: "contains",
    projectIds: [],
    evidenceIds: [],
    lastApprovedAt: new Date("2026-01-01T00:00:00Z"),
    lastApprovedBy: "stark",
    ...extra,
  };
}

describe("buildTopologyV2Graph — regression: TopologyMapV2 must not be mounted with empty nodes/edges", () => {
  it("maps ontology insight nodes into TopologyV2Node — the P2 scaffold hardcoded nodes={[]} which made the v2 canvas render nothing", () => {
    const nodes = [
      node({ id: "project:ontology-atlas", kind: "project", title: "ontology-atlas" }),
      node({ id: "domain:auth", kind: "domain", title: "Auth" }),
      node({ id: "document:readme", kind: "document", title: "README" }),
    ];
    const edges = [edge()];

    const graph = buildTopologyV2Graph(nodes, edges);

    expect(graph.nodes).toHaveLength(2); // document kind excluded — not in TopologyV2Node's kind union
    expect(graph.nodes.map((n) => n.id).sort()).toEqual([
      "domain:auth",
      "project:ontology-atlas",
    ]);
    expect(graph.edges).toHaveLength(1);
    expect(graph.edges[0]).toMatchObject({
      source: "project:ontology-atlas",
      target: "domain:auth",
      kind: "contains",
    });
  });

  it("drops edges whose endpoint was excluded (e.g. a document) so the world builder never sees dangling refs", () => {
    const nodes = [
      node({ id: "project:ontology-atlas", kind: "project" }),
      node({ id: "document:readme", kind: "document" }),
    ];
    const edges = [
      edge({ from: "project:ontology-atlas", to: "document:readme", type: "describes" }),
    ];

    const graph = buildTopologyV2Graph(nodes, edges);

    expect(graph.nodes).toHaveLength(1);
    expect(graph.edges).toHaveLength(0);
  });

  it("computes fullDegree from included edges only (both directions)", () => {
    const nodes = [
      node({ id: "a", kind: "project" }),
      node({ id: "b", kind: "domain" }),
      node({ id: "c", kind: "domain" }),
    ];
    const edges = [
      edge({ id: "e1", from: "a", to: "b", type: "contains" }),
      edge({ id: "e2", from: "a", to: "c", type: "contains" }),
    ];

    const graph = buildTopologyV2Graph(nodes, edges);
    const degreeById = new Map(graph.nodes.map((n) => [n.id, n.fullDegree]));

    expect(degreeById.get("a")).toBe(2);
    expect(degreeById.get("b")).toBe(1);
    expect(degreeById.get("c")).toBe(1);
  });

  it("marks a node isHub when its incoming (fan-in) count reaches PROMOTION_MIN_FAN_IN", () => {
    const nodes = [
      node({ id: "core", kind: "capability" }),
      node({ id: "d1", kind: "domain" }),
      node({ id: "d2", kind: "domain" }),
      node({ id: "d3", kind: "domain" }),
      node({ id: "d4", kind: "domain" }),
    ];
    const edges = ["d1", "d2", "d3", "d4"].map((from, i) =>
      edge({ id: `e${i}`, from, to: "core", type: "depends_on" }),
    );

    const graph = buildTopologyV2Graph(nodes, edges);
    const core = graph.nodes.find((n) => n.id === "core");

    expect(core?.isHub).toBe(true);
  });

  it("does not mark a node isHub when fan-in is below the threshold", () => {
    const nodes = [
      node({ id: "core", kind: "capability" }),
      node({ id: "d1", kind: "domain" }),
    ];
    const edges = [edge({ id: "e0", from: "d1", to: "core", type: "depends_on" })];

    const graph = buildTopologyV2Graph(nodes, edges);
    const core = graph.nodes.find((n) => n.id === "core");

    expect(core?.isHub).toBe(false);
  });

  it("marks recentlyUpdated true only for slugs present in the changedSlugs set", () => {
    const nodes = [
      node({ id: "a", kind: "project" }),
      node({ id: "b", kind: "domain" }),
    ];

    const graph = buildTopologyV2Graph(nodes, [], { changedSlugs: new Set(["a"]) });
    const byId = new Map(graph.nodes.map((n) => [n.id, n.recentlyUpdated]));

    expect(byId.get("a")).toBe(true);
    expect(byId.get("b")).toBe(false);
  });

  it("maps relationQuality to strong/weak/null and evidenceCount from the edge's evidenceIds", () => {
    const nodes = [node({ id: "a", kind: "project" }), node({ id: "b", kind: "domain" })];
    const edges = [
      edge({
        id: "e1",
        from: "a",
        to: "b",
        type: "contains",
        evidenceIds: ["ev1"],
        lastApprovedBy: "stark",
      }),
    ];

    const graph = buildTopologyV2Graph(nodes, edges);

    expect(graph.edges[0]?.relationQuality).toBe("strong");
    expect(graph.edges[0]?.evidenceCount).toBe(1);
  });

  it("returns empty arrays for empty input (no ontology insight yet)", () => {
    expect(buildTopologyV2Graph([], [])).toEqual({ nodes: [], edges: [] });
  });
});
