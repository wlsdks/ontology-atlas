import { describe, expect, it } from "vitest";
import type { KnowledgeGraphEdge, KnowledgeGraphNode } from "@/entities/knowledge-graph";
import {
  buildActivityTimeline,
  computeDegreeCentrality,
  computeKindDistribution,
  selectRecentNodes,
  selectTopByDegree,
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

describe("selectTopByDegree", () => {
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

  it("default — document / project 제외, degree desc", () => {
    const top = selectTopByDegree(nodes, edges);
    expect(top).toHaveLength(3); // hub + leaf-1 + leaf-2 (doc / proj 제외)
    expect(top[0]?.node.id).toBe("hub");
    expect(top[0]?.degree).toBeGreaterThanOrEqual(top[1]?.degree ?? 0);
  });

  it("degree 0 노드 제외", () => {
    const isolated = node("isolated", "capability");
    const top = selectTopByDegree([...nodes, isolated], edges);
    expect(top.find((r) => r.node.id === "isolated")).toBeUndefined();
  });

  it("limit 적용", () => {
    const top = selectTopByDegree(nodes, edges, 1);
    expect(top).toHaveLength(1);
  });

  it("includeKinds — 명시 kind 만", () => {
    const top = selectTopByDegree(nodes, edges, 10, { includeKinds: ["element"] });
    expect(top.every((r) => r.node.kind === "element")).toBe(true);
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

describe("buildActivityTimeline", () => {
  // now 고정 — 2026-04-27 12:00 local. 자정 기준 오늘 = 2026-04-27.
  const now = new Date(2026, 3, 27, 12, 0, 0);

  it("default 30 일 — 모든 day count=0 으로 prefill", () => {
    const result = buildActivityTimeline([], { now });
    expect(result).toHaveLength(30);
    expect(result.every((d) => d.count === 0)).toBe(true);
  });

  it("date asc 정렬", () => {
    const result = buildActivityTimeline([], { now, days: 5 });
    expect(result.map((d) => d.date)).toEqual([
      "2026-04-23",
      "2026-04-24",
      "2026-04-25",
      "2026-04-26",
      "2026-04-27",
    ]);
  });

  it("같은 날 노드 여러 → 카운트 합산", () => {
    const day = new Date(2026, 3, 25, 9, 0, 0);
    const result = buildActivityTimeline(
      [
        node("a", "capability", day),
        node("b", "capability", day),
        node("c", "capability", day),
      ],
      { now, days: 5 },
    );
    expect(result.find((d) => d.date === "2026-04-25")?.count).toBe(3);
  });

  it("범위 밖 노드 무시", () => {
    const old = new Date(2025, 0, 1);
    const today = new Date(2026, 3, 27, 9, 0, 0);
    const result = buildActivityTimeline(
      [node("old", "capability", old), node("today", "capability", today)],
      { now, days: 5 },
    );
    const total = result.reduce((s, d) => s + d.count, 0);
    expect(total).toBe(1); // today 만
    expect(result.find((d) => d.date === "2026-04-27")?.count).toBe(1);
  });

  it("days 인자로 윈도우 크기 변경", () => {
    const result = buildActivityTimeline([], { now, days: 7 });
    expect(result).toHaveLength(7);
  });
});
