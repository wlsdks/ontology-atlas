import { describe, expect, it } from "vitest";
import type { KnowledgeGraphEdge, KnowledgeGraphNode } from "@/entities/knowledge-graph";
import { findDependencyCycles, isDependencyEdgeType } from "./dependency-cycles";

function n(id: string): KnowledgeGraphNode {
  return {
    id,
    title: id,
    kind: "capability",
    projectIds: [],
    evidenceIds: [id.replace(":", "s/")],
    lastApprovedAt: new Date(0),
    lastApprovedBy: "vault-frontmatter",
  } as KnowledgeGraphNode;
}

function e(from: string, to: string, type = "depends_on"): KnowledgeGraphEdge {
  return { from, to, type } as KnowledgeGraphEdge;
}

/** Builds a node array from a list of ids. */
function nodes(...ids: string[]): KnowledgeGraphNode[] {
  return ids.map(n);
}

describe("isDependencyEdgeType", () => {
  it("depends_on · dependencies 만 의존 계열로 본다 (MCP cycles 파생과 동일)", () => {
    expect(isDependencyEdgeType("depends_on")).toBe(true);
    expect(isDependencyEdgeType("dependencies")).toBe(true);
  });

  it("containment · 기타 계열은 의존으로 보지 않는다", () => {
    for (const t of ["contains", "belongs_to", "relates", "related_to", "implements", "uses", "describes"]) {
      expect(isDependencyEdgeType(t)).toBe(false);
    }
  });
});

describe("findDependencyCycles", () => {
  it("사이클 0 — 비순환 의존 사슬은 빈 결과", () => {
    const g = nodes("c:a", "c:b", "c:c");
    const edges = [e("c:a", "c:b"), e("c:b", "c:c")];
    const result = findDependencyCycles(g, edges);
    expect(result.cycles).toEqual([]);
    expect(result.totalCycles).toBe(0);
    expect(result.hiddenCycles).toBe(0);
    expect(result.activeCycleIds).toEqual([]);
  });

  it("사이클 0 — containment 순환은 의존 사이클이 아니다", () => {
    const g = nodes("c:a", "c:b");
    // A loop through `contains` only → ignored.
    const edges = [e("c:a", "c:b", "contains"), e("c:b", "c:a", "belongs_to")];
    expect(findDependencyCycles(g, edges).totalCycles).toBe(0);
  });

  it("사이클 1 — A→B→C→A 를 방향 유지해 하나로 잡는다", () => {
    const g = nodes("c:a", "c:b", "c:c");
    const edges = [e("c:a", "c:b"), e("c:b", "c:c"), e("c:c", "c:a")];
    const result = findDependencyCycles(g, edges);
    expect(result.totalCycles).toBe(1);
    const cycle = result.cycles[0];
    expect(cycle.length).toBe(3);
    expect(cycle.nodeIds).toEqual(["c:a", "c:b", "c:c"]);
    expect(cycle.hiddenNodeCount).toBe(0);
  });

  it("사이클 1 — 시작 노드가 달라도 회전 중복을 하나로 접는다", () => {
    const g = nodes("c:a", "c:b", "c:c");
    // One cycle in one direction stays one, however many entry points exist.
    const edges = [e("c:b", "c:c"), e("c:c", "c:a"), e("c:a", "c:b")];
    expect(findDependencyCycles(g, edges).totalCycles).toBe(1);
  });

  it("자기참조 — A depends_on A 를 길이 1 사이클로 잡는다", () => {
    const g = nodes("c:a", "c:b");
    const edges = [e("c:a", "c:a"), e("c:a", "c:b")];
    const result = findDependencyCycles(g, edges);
    expect(result.totalCycles).toBe(1);
    expect(result.cycles[0].nodeIds).toEqual(["c:a"]);
    expect(result.cycles[0].length).toBe(1);
  });

  it("중첩 — 두 사이클이 노드를 공유하면 각각 별개로 잡는다", () => {
    // a→b→a (a 2-cycle) and a→b→c→a (a 3-cycle) share nodes a and b.
    const g = nodes("c:a", "c:b", "c:c");
    const edges = [e("c:a", "c:b"), e("c:b", "c:a"), e("c:b", "c:c"), e("c:c", "c:a")];
    const result = findDependencyCycles(g, edges);
    expect(result.totalCycles).toBe(2);
    // Sorted shortest first.
    expect(result.cycles[0].length).toBe(2);
    expect(result.cycles[1].length).toBe(3);
  });

  it("상한 — 사이클 5개 초과는 5개만 노출하고 나머지는 hiddenCycles", () => {
    // Eight distinct cycles returning through the shared `hub` node.
    const g = nodes("c:hub", ...Array.from({ length: 8 }, (_, i) => `c:n${i}`));
    const edges: KnowledgeGraphEdge[] = [];
    for (let i = 0; i < 8; i++) {
      edges.push(e("c:hub", `c:n${i}`));
      edges.push(e(`c:n${i}`, "c:hub"));
    }
    const result = findDependencyCycles(g, edges);
    expect(result.totalCycles).toBe(8);
    expect(result.cycles.length).toBe(5);
    expect(result.hiddenCycles).toBe(3);
    expect(result.activeCycleIds).toHaveLength(8);
  });

  it("경로 상한 — 8 노드 초과 사이클은 8개만 표기하고 hiddenNodeCount 로 정직 표기", () => {
    // A single 10-node cycle.
    const ids = Array.from({ length: 10 }, (_, i) => `c:p${i}`);
    const g = nodes(...ids);
    const edges = ids.map((id, i) => e(id, ids[(i + 1) % ids.length]));
    const result = findDependencyCycles(g, edges, { maxHops: 12 });
    expect(result.totalCycles).toBe(1);
    const cycle = result.cycles[0];
    expect(cycle.length).toBe(10);
    expect(cycle.nodeIds).toHaveLength(8);
    expect(cycle.hiddenNodeCount).toBe(2);
  });

  it("dangling — 노드 집합에 없는 끝점을 가진 의존 edge 는 무시", () => {
    const g = nodes("c:a", "c:b");
    const edges = [e("c:a", "c:b"), e("c:b", "c:ghost"), e("c:ghost", "c:a")];
    expect(findDependencyCycles(g, edges).totalCycles).toBe(0);
  });

  it("성능 — 300 노드 링 + 화음에서 ms 급으로 끝난다", () => {
    // `pad(id)` stabilizes digit alignment (consistent string min-vertex comparison).
    const pad = (i: number) => `c:${String(i).padStart(3, "0")}`;
    const ids = Array.from({ length: 300 }, (_, i) => pad(i));
    const g = nodes(...ids);
    // A ring (length 300, beyond the detection limit so undetected) plus many short chord cycles (detected).
    const edges: KnowledgeGraphEdge[] = ids.map((id, i) => e(id, ids[(i + 1) % ids.length]));
    for (let i = 0; i + 2 < ids.length; i += 3) {
      edges.push(e(ids[i + 2], ids[i])); // an i → i+1 → i+2 → i 3-cycle
    }
    const t0 = performance.now();
    const result = findDependencyCycles(g, edges);
    const elapsed = performance.now() - t0;
    expect(result.totalCycles).toBeGreaterThanOrEqual(1);
    expect(elapsed).toBeLessThan(50);
  });
});
