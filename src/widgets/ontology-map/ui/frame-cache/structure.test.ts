import { describe, expect, it } from "vitest";
import { indexedPulseEdges, rankedDiscChildren, rankedEgoNeighbors } from "./structure";
import type { WorldEdge, WorldNode } from "../topology-world";

function world(ids = ["element:a", "capability:b", "element:c"]) {
  return {
    nodes: ids,
    nodeById: new Map(ids.map((id) => [id, { id, kind: id.split(":")[0], x: 0, y: 0 } as WorldNode])),
    neighborMap: new Map(ids.map((id, index) => [id, new Set(ids.slice(0, index))])),
    childrenByParent: new Map([["parent", ids]]),
    edges: [
      { sourceId: ids[0], targetId: ids[1], ax: 1 },
      { sourceId: ids[0], targetId: ids[1], ax: 2 },
      { sourceId: ids[1], targetId: ids[0], ax: 3 },
    ] as WorldEdge[],
  };
}

describe("map frame structure reuse", () => {
  it("preserves directed duplicate-pair lookup and reads the live edge geometry", () => {
    const graph = world();
    const index = indexedPulseEdges(graph);
    expect(index.get("element:a capability:b")).toBe(graph.edges[1]);
    expect(index.get("capability:b element:a")).toBe(graph.edges[2]);
    graph.edges[1].ax = 42;
    expect(indexedPulseEdges(graph)).toBe(index);
    expect(index.get("element:a capability:b")?.ax).toBe(42);
    const replacement = world();
    expect(indexedPulseEdges(replacement).get("element:a capability:b")).toBe(replacement.edges[1]);
  });

  it("keeps kind and degree ranking while coordinates move", () => {
    const graph = world();
    const ranked = rankedDiscChildren(graph, "parent");
    expect(ranked).toEqual(["capability:b", "element:c", "element:a"]);
    graph.nodeById.get("element:a")!.x = 200;
    expect(rankedDiscChildren(graph, "parent")).toBe(ranked);
    expect(rankedDiscChildren(graph, "missing")).toEqual([]);
    const replacement = world(["element:a", "element:c", "capability:b"]);
    expect(rankedDiscChildren(replacement, "parent")).toEqual(["capability:b", "element:c", "element:a"]);
  });

  it("invalidates a reused dome union when its members change without changing its size", () => {
    const graph = world();
    const members = new Set(["element:a", "capability:b"]);
    const ranked = rankedEgoNeighbors(graph, members);
    expect(ranked).toEqual(["capability:b", "element:a"]);
    expect(rankedEgoNeighbors(graph, members)).toBe(ranked);
    members.delete("element:a");
    members.add("element:c");
    expect(rankedEgoNeighbors(graph, members)).toEqual(["capability:b", "element:c"]);
    members.clear();
    expect(rankedEgoNeighbors(graph, members)).toEqual([]);
  });

  it("ranks a thousand members deterministically including Hangul identifiers", () => {
    const ids = Array.from({ length: 1000 }, (_, index) => `element:개념-${index}`);
    const graph = world(ids);
    const ranked = rankedDiscChildren(graph, "parent");
    expect(ranked).toEqual([...ids].reverse());
    expect(rankedDiscChildren(graph, "parent")).toBe(ranked);
    expect(indexedPulseEdges({ ...graph, edges: [] }).size).toBe(0);
  });
});
