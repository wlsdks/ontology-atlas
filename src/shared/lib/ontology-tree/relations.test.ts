import { describe, expect, it } from "vitest";
import type { KnowledgeGraphEdge, KnowledgeGraphNode } from "@/entities/knowledge-graph";
import {
  computeEdgeTypeDistribution,
  countCrossProjectEdges,
  selectStrongEdges,
} from "./relations";

const APPROVED_AT = new Date("2026-04-27T00:00:00Z");
const node = (
  id: string,
  title = id,
  projectIds: string[] = [],
): KnowledgeGraphNode => ({
  id,
  title,
  kind: "capability",
  projectIds,
  evidenceIds: [],
  lastApprovedAt: APPROVED_AT,
  lastApprovedBy: "test",
});
const edge = (
  id: string,
  from: string,
  to: string,
  type = "depends_on",
  evidenceCount?: number,
  evidenceIds: string[] = [],
): KnowledgeGraphEdge => ({
  id,
  from,
  to,
  type,
  projectIds: [],
  evidenceIds,
  evidenceCount,
  lastApprovedAt: APPROVED_AT,
  lastApprovedBy: "test",
});

describe("computeEdgeTypeDistribution", () => {
  it("type 별 카운트", () => {
    const dist = computeEdgeTypeDistribution([
      edge("e1", "a", "b", "contains"),
      edge("e2", "b", "c", "contains"),
      edge("e3", "a", "c", "depends_on"),
    ]);
    expect(dist.get("contains")).toBe(2);
    expect(dist.get("depends_on")).toBe(1);
  });

  it("빈 배열 → 빈 Map", () => {
    expect(computeEdgeTypeDistribution([]).size).toBe(0);
  });
});

describe("selectStrongEdges", () => {
  const nodes = [node("a", "Alpha"), node("b", "Beta"), node("c", "Gamma")];

  it("evidenceCount desc 정렬 + title resolve", () => {
    const result = selectStrongEdges(
      [
        edge("e1", "a", "b", "contains", 1),
        edge("e2", "b", "c", "depends_on", 5),
        edge("e3", "a", "c", "uses", 3),
      ],
      nodes,
    );
    expect(result[0]?.edge.id).toBe("e2");
    expect(result[0]?.evidence).toBe(5);
    expect(result[0]?.fromTitle).toBe("Beta");
    expect(result[0]?.toTitle).toBe("Gamma");
  });

  it("evidenceCount 없으면 evidenceIds.length fallback", () => {
    const result = selectStrongEdges(
      [edge("e1", "a", "b", "uses", undefined, ["doc-1", "doc-2", "doc-3"])],
      nodes,
    );
    expect(result[0]?.evidence).toBe(3);
  });

  it("같은 evidence — type asc 안정 정렬", () => {
    const result = selectStrongEdges(
      [edge("eA", "a", "b", "uses", 5), edge("eB", "b", "c", "contains", 5)],
      nodes,
    );
    expect(result[0]?.edge.type).toBe("contains");
    expect(result[1]?.edge.type).toBe("uses");
  });

  it("미존재 노드 가리키는 edge — title null", () => {
    const result = selectStrongEdges([edge("e", "a", "ghost", "uses", 1)], nodes);
    expect(result[0]?.fromTitle).toBe("Alpha");
    expect(result[0]?.toTitle).toBeNull();
  });

  it("limit 적용", () => {
    const many = Array.from({ length: 50 }, (_, i) =>
      edge(`e-${i}`, "a", "b", "uses", i),
    );
    expect(selectStrongEdges(many, nodes, 5)).toHaveLength(5);
  });

  describe("UX-15 isCrossProject", () => {
    it("두 노드가 같은 project 공유 → false", () => {
      const ns = [
        node("a", "A", ["proj-x"]),
        node("b", "B", ["proj-x", "proj-y"]),
      ];
      const result = selectStrongEdges(
        [edge("e1", "a", "b", "depends_on", 1)],
        ns,
      );
      expect(result[0]?.isCrossProject).toBe(false);
    });

    it("두 노드의 projectIds disjoint → true", () => {
      const ns = [
        node("a", "A", ["aslan-iam"]),
        node("b", "B", ["paravel-app"]),
      ];
      const result = selectStrongEdges(
        [edge("e1", "a", "b", "depends_on", 1)],
        ns,
      );
      expect(result[0]?.isCrossProject).toBe(true);
    });

    it("한 쪽 projectIds 비면 false (안전 폴백)", () => {
      const ns = [node("a", "A", []), node("b", "B", ["paravel-app"])];
      const result = selectStrongEdges(
        [edge("e1", "a", "b", "depends_on", 1)],
        ns,
      );
      expect(result[0]?.isCrossProject).toBe(false);
    });

    it("from/to 노드 정보 부족 (미존재 노드) → false", () => {
      const ns = [node("a", "A", ["proj-x"])];
      const result = selectStrongEdges(
        [edge("e1", "a", "ghost", "depends_on", 1)],
        ns,
      );
      expect(result[0]?.isCrossProject).toBe(false);
    });
  });
});

describe("countCrossProjectEdges (UX-17)", () => {
  it("빈 입력 → 0", () => {
    expect(countCrossProjectEdges([], [])).toBe(0);
  });

  it("같은 프로젝트 edge → 0 (cross 아님)", () => {
    const ns = [node("a", "A", ["p1"]), node("b", "B", ["p1"])];
    const es = [edge("e1", "a", "b", "depends_on")];
    expect(countCrossProjectEdges(es, ns)).toBe(0);
  });

  it("disjoint projectIds edge 만 카운트", () => {
    const ns = [
      node("a", "A", ["aslan-iam"]),
      node("b", "B", ["paravel-app"]),
      node("c", "C", ["aslan-iam"]),
      node("d", "D", ["aslan-iam"]),
    ];
    const es = [
      edge("e1", "a", "b", "depends_on"), // cross
      edge("e2", "c", "d", "uses"), // 같은 project
      edge("e3", "b", "a", "uses"), // cross
    ];
    expect(countCrossProjectEdges(es, ns)).toBe(2);
  });

  it("미존재 노드 edge → 0 (안전 폴백)", () => {
    const ns = [node("a", "A", ["p1"])];
    const es = [edge("e1", "a", "ghost", "depends_on")];
    expect(countCrossProjectEdges(es, ns)).toBe(0);
  });

  it("빈 projectIds 노드 edge → 0", () => {
    const ns = [node("a", "A", []), node("b", "B", ["p2"])];
    const es = [edge("e1", "a", "b", "uses")];
    expect(countCrossProjectEdges(es, ns)).toBe(0);
  });
});
