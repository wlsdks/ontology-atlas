import { describe, expect, it } from "vitest";
import type { KnowledgeGraphEdge, KnowledgeGraphNode } from "@/entities/knowledge-graph";
import {
  computeEdgeTypeDistribution,
  countCrossProjectEdges,
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

describe("countCrossProjectEdges", () => {
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
      node("a", "A", ["demo-iam"]),
      node("b", "B", ["sample-app"]),
      node("c", "C", ["demo-iam"]),
      node("d", "D", ["demo-iam"]),
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
