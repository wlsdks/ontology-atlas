import { describe, expect, it } from "vitest";
import Graph from "graphology";
import { computeDepthMap, shortestPath } from "./depth";
import type { SigmaEdgeAttrs, SigmaNodeAttrs } from "./graph-build";

function makeGraph(
  nodes: ReadonlyArray<string>,
  edges: ReadonlyArray<[string, string]>,
): Graph<SigmaNodeAttrs, SigmaEdgeAttrs> {
  const g = new Graph<SigmaNodeAttrs, SigmaEdgeAttrs>({ multi: false });
  for (const id of nodes) {
    g.addNode(id, {} as SigmaNodeAttrs);
  }
  for (const [from, to] of edges) {
    g.addEdge(from, to, {} as SigmaEdgeAttrs);
  }
  return g;
}

describe("computeDepthMap", () => {
  it("source 가 null / undefined → 빈 Map", () => {
    const g = makeGraph(["a", "b"], [["a", "b"]]);
    expect(computeDepthMap(g, null).size).toBe(0);
    expect(computeDepthMap(g, undefined).size).toBe(0);
  });

  it("source 가 그래프에 없으면 빈 Map", () => {
    const g = makeGraph(["a"], []);
    expect(computeDepthMap(g, "ghost").size).toBe(0);
  });

  it("source 자신은 depth 0, 직접 이웃은 1, 두 다리는 2", () => {
    const g = makeGraph(
      ["a", "b", "c"],
      [
        ["a", "b"],
        ["b", "c"],
      ],
    );
    const depths = computeDepthMap(g, "a");
    expect(depths.get("a")).toBe(0);
    expect(depths.get("b")).toBe(1);
    expect(depths.get("c")).toBe(2);
  });

  it("undirected — 역방향 edge 도 이웃으로 탐색", () => {
    const g = makeGraph(
      ["a", "b", "c"],
      [
        ["b", "a"], // 역방향
        ["c", "b"],
      ],
    );
    const depths = computeDepthMap(g, "a");
    expect(depths.get("b")).toBe(1);
    expect(depths.get("c")).toBe(2);
  });

  it("도달 불가 노드는 Map 미포함", () => {
    const g = makeGraph(["a", "b", "isolated"], [["a", "b"]]);
    const depths = computeDepthMap(g, "a");
    expect(depths.has("isolated")).toBe(false);
  });
});

describe("shortestPath", () => {
  it("source === target → 자기 1 노드 경로", () => {
    const g = makeGraph(["a"], []);
    expect(shortestPath(g, "a", "a")).toEqual(["a"]);
  });

  it("미존재 source 또는 target → null", () => {
    const g = makeGraph(["a"], []);
    expect(shortestPath(g, "ghost", "a")).toBeNull();
    expect(shortestPath(g, "a", "ghost")).toBeNull();
  });

  it("미연결 노드 → null", () => {
    const g = makeGraph(["a", "b"], []);
    expect(shortestPath(g, "a", "b")).toBeNull();
  });

  it("최단 경로 (source → ... → target) 정상 반환", () => {
    const g = makeGraph(
      ["a", "b", "c", "d"],
      [
        ["a", "b"],
        ["b", "c"],
        ["c", "d"],
      ],
    );
    expect(shortestPath(g, "a", "d")).toEqual(["a", "b", "c", "d"]);
  });

  it("두 가지 경로 중 짧은 쪽 선택 (BFS)", () => {
    const g = makeGraph(
      ["a", "b", "c", "d"],
      [
        ["a", "b"],
        ["b", "c"],
        ["c", "d"],
        ["a", "d"], // shortcut
      ],
    );
    expect(shortestPath(g, "a", "d")).toEqual(["a", "d"]);
  });
});
