import { describe, expect, it } from "vitest";
import type { KnowledgeGraphEdge, KnowledgeGraphNode } from "@/entities/knowledge-graph";
import { buildOntologyEgoSubgraph } from "./build-ego";
import { buildRadialEgoLayout } from "./ego-layout";

const APPROVED_AT = new Date("2026-04-27T00:00:00Z");
const node = (id: string): KnowledgeGraphNode => ({
  id,
  title: id,
  kind: "capability",
  projectIds: [],
  evidenceIds: [],
  lastApprovedAt: APPROVED_AT,
  lastApprovedBy: "test",
});
const edge = (id: string, from: string, to: string): KnowledgeGraphEdge => ({
  id,
  from,
  to,
  type: "depends_on",
  projectIds: [],
  evidenceIds: [],
  lastApprovedAt: APPROVED_AT,
  lastApprovedBy: "test",
});

describe("buildRadialEgoLayout", () => {
  it("center = viewBox 중앙", () => {
    const ego = buildOntologyEgoSubgraph("a", [node("a")], []);
    const layout = buildRadialEgoLayout(ego, 200, 100);
    expect(layout.center.x).toBe(100);
    expect(layout.center.y).toBe(50);
  });

  it("neighbors 비어 있으면 edges 도 비어 있음", () => {
    const ego = buildOntologyEgoSubgraph("a", [node("a")], []);
    const layout = buildRadialEgoLayout(ego, 100, 100);
    expect(layout.neighbors).toHaveLength(0);
    expect(layout.edges).toHaveLength(0);
  });

  it("4 neighbors → 12·3·6·9시 위치 (시계 방향)", () => {
    const ego = buildOntologyEgoSubgraph(
      "a",
      [node("a"), node("n1"), node("n2"), node("n3"), node("n4")],
      [
        edge("e1", "a", "n1"),
        edge("e2", "a", "n2"),
        edge("e3", "a", "n3"),
        edge("e4", "a", "n4"),
      ],
    );
    const layout = buildRadialEgoLayout(ego, 200, 200, { radius: 50, padding: 0 });
    // 0번 = 12시 (위) — y 가 center 보다 작음
    expect(layout.neighbors[0]?.y).toBeLessThan(layout.center.y);
    expect(Math.abs(layout.neighbors[0]!.x - layout.center.x)).toBeLessThan(0.001);
    // 1번 = 3시 (오른쪽)
    expect(layout.neighbors[1]?.x).toBeGreaterThan(layout.center.x);
    // 2번 = 6시 (아래)
    expect(layout.neighbors[2]?.y).toBeGreaterThan(layout.center.y);
    // 3번 = 9시 (왼쪽)
    expect(layout.neighbors[3]?.x).toBeLessThan(layout.center.x);
  });

  it("outgoing edge: from = center, to = neighbor (화살표 방향)", () => {
    const ego = buildOntologyEgoSubgraph(
      "a",
      [node("a"), node("b")],
      [edge("e1", "a", "b")],
    );
    const layout = buildRadialEgoLayout(ego, 100, 100);
    const ed = layout.edges[0]!;
    expect(ed.direction).toBe("outgoing");
    expect(ed.from.x).toBe(layout.center.x);
    expect(ed.from.y).toBe(layout.center.y);
    expect(ed.to.x).toBe(layout.neighbors[0]!.x);
  });

  it("incoming edge: from = neighbor, to = center", () => {
    const ego = buildOntologyEgoSubgraph(
      "a",
      [node("a"), node("b")],
      [edge("e1", "b", "a")],
    );
    const layout = buildRadialEgoLayout(ego, 100, 100);
    const ed = layout.edges[0]!;
    expect(ed.direction).toBe("incoming");
    expect(ed.from.x).toBe(layout.neighbors[0]!.x);
    expect(ed.to.x).toBe(layout.center.x);
  });

  it("padding 으로 inferred radius 결정 — 라벨 안전 마진", () => {
    const ego = buildOntologyEgoSubgraph("a", [node("a"), node("b")], [edge("e", "a", "b")]);
    const layout = buildRadialEgoLayout(ego, 200, 200, { padding: 30 });
    // radius = min(200,200)/2 - 30 = 70
    const dx = layout.neighbors[0]!.x - layout.center.x;
    const dy = layout.neighbors[0]!.y - layout.center.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    expect(dist).toBeCloseTo(70, 5);
  });
});

describe("buildRadialEgoLayout — 2-hop 동심원", () => {
  it("hop=1 inner ring, hop=2 outer ring (radius 분리)", () => {
    const ego = buildOntologyEgoSubgraph(
      "c",
      [node("c"), node("a"), node("b")],
      [edge("e1", "c", "a"), edge("e2", "a", "b")],
      { hops: 2 },
    );
    const layout = buildRadialEgoLayout(ego, 200, 200, {
      radius: 80,
      padding: 0,
      innerRadiusRatio: 0.5,
    });

    const hop1Point = layout.neighbors.find((n) => n.id === "a")!;
    const hop2Point = layout.neighbors.find((n) => n.id === "b")!;

    const hop1Dist = Math.hypot(
      hop1Point.x - layout.center.x,
      hop1Point.y - layout.center.y,
    );
    const hop2Dist = Math.hypot(
      hop2Point.x - layout.center.x,
      hop2Point.y - layout.center.y,
    );

    expect(hop1Dist).toBeCloseTo(40, 5); // 80 * 0.5
    expect(hop2Dist).toBeCloseTo(80, 5);
    expect(hop1Point.hop).toBe(1);
    expect(hop2Point.hop).toBe(2);
  });

  it("hop=2 edge 는 pivot (1-hop 위치) → far (2-hop 위치) 로 그림", () => {
    const ego = buildOntologyEgoSubgraph(
      "c",
      [node("c"), node("a"), node("b")],
      [edge("e1", "c", "a"), edge("e2", "a", "b")],
      { hops: 2 },
    );
    const layout = buildRadialEgoLayout(ego, 200, 200);
    const hop2Edge = layout.edges.find((e) => e.hop === 2)!;
    const hop1Point = layout.neighbors.find((n) => n.id === "a")!;
    const hop2Point = layout.neighbors.find((n) => n.id === "b")!;

    expect(hop2Edge.from.x).toBeCloseTo(hop1Point.x, 5);
    expect(hop2Edge.from.y).toBeCloseTo(hop1Point.y, 5);
    expect(hop2Edge.to.x).toBeCloseTo(hop2Point.x, 5);
    expect(hop2Edge.to.y).toBeCloseTo(hop2Point.y, 5);
  });

  it("hop=2 incoming edge — far → pivot 방향 (2-hop 노드가 source)", () => {
    const ego = buildOntologyEgoSubgraph(
      "c",
      [node("c"), node("a"), node("b")],
      [edge("e1", "c", "a"), edge("e2", "b", "a")], // b → a, b 가 2-hop incoming
      { hops: 2 },
    );
    const layout = buildRadialEgoLayout(ego, 200, 200);
    const hop2Edge = layout.edges.find((e) => e.hop === 2)!;
    const pivot = layout.neighbors.find((n) => n.id === "a")!;
    const far = layout.neighbors.find((n) => n.id === "b")!;
    expect(hop2Edge.direction).toBe("incoming");
    // incoming: from = far (b), to = pivot (a)
    expect(hop2Edge.from.x).toBeCloseTo(far.x, 5);
    expect(hop2Edge.to.x).toBeCloseTo(pivot.x, 5);
  });

  it("1-hop 만 있을 때는 단일 ring (회귀 호환 — inner = outer)", () => {
    const ego = buildOntologyEgoSubgraph(
      "a",
      [node("a"), node("b")],
      [edge("e", "a", "b")],
    );
    const layout = buildRadialEgoLayout(ego, 200, 200, { radius: 80, padding: 0 });
    const dist = Math.hypot(
      layout.neighbors[0]!.x - layout.center.x,
      layout.neighbors[0]!.y - layout.center.y,
    );
    expect(dist).toBeCloseTo(80, 5);
  });
});
