import { describe, expect, it } from "vitest";

import type { OntologyMapTokens } from "../../tokens/read-map-tokens";
import type { TopologyWorld, WorldEdge, WorldNode } from "./topology-world";
import { computeEdgeControlPoint, recomputeWorldGeometry } from "./world-edge-geometry";

const tokens = {
  radiusProject: 20,
  radiusDomain: 14,
  radiusCapability: 8,
  radiusElement: 5,
  edgeBowDepends: 10,
  edgeBowContains: 40,
  edgeBlendContains: 0,
} as unknown as OntologyMapTokens;

describe("computeEdgeControlPoint", () => {
  it("bows a depends edge to the left of its travel direction by the depends token", () => {
    expect(computeEdgeControlPoint("depends", { x: 0, y: 0 }, { x: 100, y: 0 }, tokens)).toEqual({ x: 50, y: 10 });
  });

  it("scales a contains bow by its blend, so a zero blend stays on the segment midpoint", () => {
    expect(computeEdgeControlPoint("contains", { x: 0, y: 0 }, { x: 100, y: 0 }, tokens)).toEqual({ x: 50, y: 0 });
  });
});

function worldNode(id: string, x: number, y: number): WorldNode {
  return {
    id, kind: "element", label: id, x, y, homeX: x, homeY: y, parentId: null, isHub: false,
    fresh: false, stale: false, count: 0, magnitudeScale: 1,
  };
}

function worldEdge(sourceId: string, targetId: string): WorldEdge {
  return {
    sourceId, targetId, kind: "depends", ax: -1, ay: -1, bx: -1, by: -1, controlX: -1, controlY: -1,
    t: 0, level: 2, relationType: "depends_on", declaredBySlug: null,
  };
}

/** a-b and c-d are separate edges; the nodes sit apart so each pass can be told from the other. */
function twoEdgeWorld(): TopologyWorld {
  const nodes = [worldNode("a", 0, 0), worldNode("b", 100, 0), worldNode("c", 0, 200), worldNode("d", 100, 200)];
  const edges = [worldEdge("a", "b"), worldEdge("c", "d")];
  return {
    nodes,
    nodeById: new Map(nodes.map((n) => [n.id, n])),
    edges,
    edgeIndexByNode: new Map([["a", [0]], ["b", [0]], ["c", [1]], ["d", [1]]]),
    bounds: { minX: -5, minY: -5, maxX: 105, maxY: 205 },
    spineBounds: { minX: -5, minY: -5, maxX: 105, maxY: 205 },
  } as unknown as TopologyWorld;
}

describe("recomputeWorldGeometry", () => {
  it("refreshes only the edges of a small moved set and lets the bounds grow without shrinking", () => {
    const world = twoEdgeWorld();
    world.nodeById.get("a")!.x = -300;
    recomputeWorldGeometry(world, tokens, new Set(["a"]));
    expect(world.edges[0].ax).toBe(-300);
    expect(world.edges[1].ax).toBe(-1);
    expect(world.bounds.minX).toBe(-305);

    world.nodeById.get("a")!.x = 0;
    recomputeWorldGeometry(world, tokens, new Set(["a"]));
    expect(world.bounds.minX).toBe(-305);
  });

  it("takes the full pass once half the nodes moved, refreshing every edge and shrinking the bounds", () => {
    const world = twoEdgeWorld();
    world.bounds.minX = -999;
    recomputeWorldGeometry(world, tokens, new Set(["a", "c"]));
    expect(world.edges[0].bx).toBe(100);
    expect(world.edges[1].bx).toBe(100);
    expect(world.bounds).toEqual({ minX: -5, minY: -5, maxX: 105, maxY: 205 });
  });

  it("takes the full pass when no moved set is given", () => {
    const world = twoEdgeWorld();
    recomputeWorldGeometry(world, tokens);
    expect(world.edges[1].ay).toBe(200);
  });
});
