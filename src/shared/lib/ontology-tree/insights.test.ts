import { describe, expect, it } from "vitest";
import type { KnowledgeGraphEdge, KnowledgeGraphNode } from "@/entities/knowledge-graph";
import {
  computeDomainCouplingMatrix,
  computeDegreeCentrality,
  computeKindDistribution,
  rankAllByDegree,
  selectRecentNodes,
} from "./insights";

const node = (
  id: string,
  kind = "capability",
  approvedAt = new Date("2026-04-27T00:00:00Z"),
): KnowledgeGraphNode => ({
  id,
  title: id,
  kind,
  projectIds: [],
  evidenceIds: [],
  lastApprovedAt: approvedAt,
  lastApprovedBy: "test",
});
const edge = (id: string, from: string, to: string): KnowledgeGraphEdge => ({
  id,
  from,
  to,
  type: "depends_on",
  projectIds: [],
  evidenceIds: [],
  lastApprovedAt: new Date("2026-04-27T00:00:00Z"),
  lastApprovedBy: "test",
});

describe("computeKindDistribution", () => {
  it("kind 별 카운트 — 빈 배열 → 빈 Map", () => {
    expect(computeKindDistribution([]).size).toBe(0);
  });

  it("여러 kind 카운트", () => {
    const dist = computeKindDistribution([
      node("a", "capability"),
      node("b", "capability"),
      node("c", "element"),
      node("d", "domain"),
    ]);
    expect(dist.get("capability")).toBe(2);
    expect(dist.get("element")).toBe(1);
    expect(dist.get("domain")).toBe(1);
  });
});

describe("computeDegreeCentrality", () => {
  it("모든 입력 노드 키 포함 (degree 0 도)", () => {
    const degrees = computeDegreeCentrality([node("a"), node("b"), node("c")], []);
    expect(degrees.get("a")).toBe(0);
    expect(degrees.get("b")).toBe(0);
    expect(degrees.get("c")).toBe(0);
  });

  it("outgoing + incoming 합산", () => {
    const degrees = computeDegreeCentrality(
      [node("a"), node("b"), node("c")],
      [edge("e1", "a", "b"), edge("e2", "c", "a")],
    );
    expect(degrees.get("a")).toBe(2); // out + in
    expect(degrees.get("b")).toBe(1);
    expect(degrees.get("c")).toBe(1);
  });

  it("self-loop 는 1 만 카운트 (양방향 더블 카운트 회피)", () => {
    const degrees = computeDegreeCentrality([node("a")], [edge("loop", "a", "a")]);
    expect(degrees.get("a")).toBe(1);
  });

  it("미존재 노드 가리키는 edge 는 무시", () => {
    const degrees = computeDegreeCentrality([node("a")], [edge("e", "a", "ghost")]);
    expect(degrees.get("a")).toBe(1);
    expect(degrees.has("ghost")).toBe(false);
  });
});

describe("rankAllByDegree", () => {
  const nodes = [
    node("hub", "capability"),
    node("leaf-1", "element"),
    node("leaf-2", "element"),
    node("doc-1", "document"),
    node("proj", "project"),
  ];
  const edges = [
    edge("e1", "hub", "leaf-1"),
    edge("e2", "hub", "leaf-2"),
    edge("e3", "doc-1", "hub"),
    edge("e4", "proj", "hub"),
  ];

  it("default — document / project 제외, degree desc, 전체 반환", () => {
    const all = rankAllByDegree(nodes, edges);
    expect(all).toHaveLength(3); // hub + leaf-1 + leaf-2 (doc / proj 제외)
    expect(all[0]?.node.id).toBe("hub");
    expect(all[0]?.degree).toBeGreaterThanOrEqual(all[1]?.degree ?? 0);
  });

  it("degree 0 노드 제외", () => {
    const isolated = node("isolated", "capability");
    const all = rankAllByDegree([...nodes, isolated], edges);
    expect(all.find((r) => r.node.id === "isolated")).toBeUndefined();
  });

  it("includeKinds — 명시 kind 만", () => {
    const all = rankAllByDegree(nodes, edges, { includeKinds: ["element"] });
    expect(all.every((r) => r.node.kind === "element")).toBe(true);
  });

  it("limit 없이 전체 후보 반환 — 호출자가 slice 로 truncation 신호 계산", () => {
    const all = rankAllByDegree(nodes, edges);
    expect(all).toHaveLength(3);
    // 상위 N 은 호출자가 all.slice(0, N) — "상위 N / 전체 M".
    expect(all.slice(0, 1)).toHaveLength(1);
    expect(all.length).toBeGreaterThan(1);
  });
});

describe("computeDomainCouplingMatrix", () => {
  it("containment tree 로 노드를 domain 에 배정하고 cross-domain connection 을 집계", () => {
    const nodes = [
      node("project:app", "project"),
      node("domain:auth", "domain"),
      node("domain:billing", "domain"),
      node("capability:login", "capability"),
      node("capability:invoice", "capability"),
      node("element:token", "element"),
      node("document:note", "document"),
    ];
    const edges: KnowledgeGraphEdge[] = [
      { ...edge("e1", "project:app", "domain:auth"), type: "contains" },
      { ...edge("e2", "project:app", "domain:billing"), type: "contains" },
      { ...edge("e3", "domain:auth", "capability:login"), type: "contains" },
      { ...edge("e4", "domain:billing", "capability:invoice"), type: "contains" },
      { ...edge("e5", "capability:login", "element:token"), type: "contains" },
      { ...edge("e6", "capability:login", "capability:invoice"), type: "depends_on" },
      { ...edge("e7", "capability:invoice", "capability:login"), type: "related_to" },
      { ...edge("e8", "capability:login", "element:token"), type: "uses" },
    ];

    const matrix = computeDomainCouplingMatrix(nodes, edges);

    expect(matrix.domainCount).toBe(2);
    expect(matrix.assignedNodeCount).toBe(5);
    expect(matrix.unassignedNodeCount).toBe(2);
    expect(matrix.crossDomainEdgeCount).toBe(2);
    expect(matrix.selfDomainEdgeCount).toBe(1);
    expect(matrix.connections).toHaveLength(2);
    // 잘리지 않은 경우 total === shown (caption 미표시 조건).
    expect(matrix.totalConnectionCount).toBe(2);
    expect(matrix.connections[0]?.from.id).toBe("domain:auth");
    expect(matrix.connections[0]?.to.id).toBe("domain:billing");
    expect(matrix.connections[0]?.relationCounts).toEqual([{ type: "depends_on", count: 1 }]);
    expect(matrix.connections[0]?.examples[0]?.id).toBe("e6");
  });

  it("connections 가 limit 으로 잘리면 totalConnectionCount 로 전체 pair 수를 노출 (silent cap 회피)", () => {
    const nodes = [
      node("domain:auth", "domain"),
      node("domain:billing", "domain"),
      node("domain:core", "domain"),
      node("capability:login", "capability"),
      node("capability:invoice", "capability"),
      node("capability:engine", "capability"),
    ];
    // 3 개의 서로 다른 directed cross-domain pair (auth→billing, billing→core,
    // core→auth) 를 만들고 limit 2 로 자른다.
    const edges: KnowledgeGraphEdge[] = [
      { ...edge("c1", "domain:auth", "capability:login"), type: "contains" },
      { ...edge("c2", "domain:billing", "capability:invoice"), type: "contains" },
      { ...edge("c3", "domain:core", "capability:engine"), type: "contains" },
      { ...edge("e1", "capability:login", "capability:invoice"), type: "depends_on" },
      { ...edge("e2", "capability:invoice", "capability:engine"), type: "depends_on" },
      { ...edge("e3", "capability:engine", "capability:login"), type: "depends_on" },
    ];

    const matrix = computeDomainCouplingMatrix(nodes, edges, 2);

    expect(matrix.connections).toHaveLength(2);
    expect(matrix.totalConnectionCount).toBe(3);
  });

  it("cycle 이 있는 containment parent 는 domain 배정 실패로 처리", () => {
    const nodes = [
      node("domain:auth", "domain"),
      node("capability:login", "capability"),
      node("capability:session", "capability"),
    ];
    const edges: KnowledgeGraphEdge[] = [
      { ...edge("e1", "capability:session", "capability:login"), type: "contains" },
      { ...edge("e2", "capability:login", "capability:session"), type: "contains" },
      { ...edge("e3", "capability:login", "domain:auth"), type: "depends_on" },
    ];

    const matrix = computeDomainCouplingMatrix(nodes, edges);

    expect(matrix.assignedNodeCount).toBe(1);
    expect(matrix.unassignedNodeCount).toBe(2);
    expect(matrix.crossDomainEdgeCount).toBe(0);
  });

  it("types 옵션으로 사람용 semantic coupling 을 재현 가능하게 좁힘", () => {
    const nodes = [
      node("domain:auth", "domain"),
      node("domain:billing", "domain"),
      node("capability:login", "capability"),
      node("capability:invoice", "capability"),
    ];
    const edges: KnowledgeGraphEdge[] = [
      { ...edge("e1", "domain:auth", "capability:login"), type: "contains" },
      { ...edge("e2", "domain:billing", "capability:invoice"), type: "contains" },
      { ...edge("e3", "capability:login", "capability:invoice"), type: "depends_on" },
      { ...edge("e4", "capability:login", "capability:invoice"), type: "uses" },
      { ...edge("e5", "capability:invoice", "capability:login"), type: "related_to" },
    ];

    const matrix = computeDomainCouplingMatrix(nodes, edges, 10, {
      types: ["depends_on", "related_to"],
    });

    expect(matrix.crossDomainEdgeCount).toBe(2);
    expect(matrix.connections.map((row) => row.relationCounts)).toEqual([
      [{ type: "depends_on", count: 1 }],
      [{ type: "related_to", count: 1 }],
    ]);
  });
});

describe("selectRecentNodes", () => {
  it("lastApprovedAt desc 정렬 + limit", () => {
    const D1 = new Date("2026-04-20T00:00:00Z");
    const D2 = new Date("2026-04-25T00:00:00Z");
    const D3 = new Date("2026-04-27T00:00:00Z");
    const result = selectRecentNodes(
      [node("a", "capability", D1), node("b", "capability", D2), node("c", "capability", D3)],
      2,
    );
    expect(result).toHaveLength(2);
    expect(result[0]?.id).toBe("c");
    expect(result[1]?.id).toBe("b");
  });

  it("같은 시각 — title asc", () => {
    const sameDate = new Date("2026-04-27T00:00:00Z");
    const result = selectRecentNodes([
      node("zebra", "capability", sameDate),
      node("apple", "capability", sameDate),
    ]);
    expect(result[0]?.id).toBe("apple");
    expect(result[1]?.id).toBe("zebra");
  });
});
