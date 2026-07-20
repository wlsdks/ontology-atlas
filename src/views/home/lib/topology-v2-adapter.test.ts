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

  it("threads a transitive descendantCount (project counts its whole subtree; a leaf counts zero)", () => {
    const nodes = [
      node({ id: "proj", kind: "project" }),
      node({ id: "dom", kind: "domain" }),
      node({ id: "cap", kind: "capability" }),
      node({ id: "el", kind: "element" }),
    ];
    const edges = [
      edge({ id: "e1", from: "proj", to: "dom", type: "contains" }),
      edge({ id: "e2", from: "dom", to: "cap", type: "contains" }),
      edge({ id: "e3", from: "cap", to: "el", type: "contains" }),
    ];

    const graph = buildTopologyV2Graph(nodes, edges);
    const countById = new Map(graph.nodes.map((n) => [n.id, n.descendantCount]));

    // Guardian I-1 — 각인 숫자(project/domain)는 역량+요소 합계(BFS census):
    // INDEX 트리·/projects 카드와 같은 숫자를 말한다. `size`(시각 규모)는
    // element weight 를 유지하므로 둘은 더 이상 항상 같지 않다.
    expect(countById.get("proj")).toBe(2); // cap + el
    expect(countById.get("dom")).toBe(2);
    expect(countById.get("el")).toBe(0);
    const sizeById = new Map(graph.nodes.map((n) => [n.id, n.size]));
    expect(sizeById.get("proj")).toBe(1); // element weight 그대로
  });

  // Regression (owner live-test, blocker 3): "amber on multiple nodes" —
  // the charter (`docs/prototypes/topology-b2plus.html`'s own fixture data
  // marks exactly one node `hub: true`) is a SINGLE amber-ring hub, the
  // highest-degree node in the graph — not every node past a threshold.
  // `isHub` used to be `incoming >= PROMOTION_MIN_FAN_IN`, which marks every
  // sufficiently-connected node as a hub; fixed to rank all nodes by
  // incoming (fan-in) count and mark only the single top one.
  it("marks isHub true for only the single highest fan-in node in the whole graph", () => {
    const nodes = [
      node({ id: "core", kind: "capability" }),
      node({ id: "second", kind: "capability" }),
      node({ id: "d1", kind: "domain" }),
      node({ id: "d2", kind: "domain" }),
      node({ id: "d3", kind: "domain" }),
      node({ id: "d4", kind: "domain" }),
      node({ id: "d5", kind: "domain" }),
    ];
    const edges = [
      ...["d1", "d2", "d3", "d4"].map((from, i) => edge({ id: `e${i}`, from, to: "core", type: "depends_on" })),
      ...["d1", "d2", "d5"].map((from, i) => edge({ id: `f${i}`, from, to: "second", type: "depends_on" })),
    ];

    const graph = buildTopologyV2Graph(nodes, edges);
    const hubs = graph.nodes.filter((n) => n.isHub).map((n) => n.id);

    expect(hubs).toEqual(["core"]); // 4 incoming, vs "second"'s 3 — single top node only
  });

  it("marks no node isHub when the graph has no edges at all", () => {
    const nodes = [node({ id: "a", kind: "project" }), node({ id: "b", kind: "domain" })];

    const graph = buildTopologyV2Graph(nodes, []);

    expect(graph.nodes.every((n) => !n.isHub)).toBe(true);
  });

  it("breaks a fan-in tie deterministically by slug (ascending)", () => {
    const nodes = [
      node({ id: "zeta", kind: "capability" }),
      node({ id: "alpha", kind: "capability" }),
      node({ id: "d1", kind: "domain" }),
    ];
    const edges = [
      edge({ id: "e0", from: "d1", to: "zeta", type: "depends_on" }),
      edge({ id: "e1", from: "d1", to: "alpha", type: "depends_on" }),
    ];

    const graph = buildTopologyV2Graph(nodes, edges);
    const hubs = graph.nodes.filter((n) => n.isHub).map((n) => n.id);

    expect(hubs).toEqual(["alpha"]);
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
