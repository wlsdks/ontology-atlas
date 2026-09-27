import { describe, expect, it } from "vitest";
import type { KnowledgeGraphEdge, KnowledgeGraphNode } from "../../model";
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
  it("places the center in the middle of the viewBox", () => {
    const ego = buildOntologyEgoSubgraph("a", [node("a")], []);
    const layout = buildRadialEgoLayout(ego, 200, 100);
    expect(layout.center.x).toBe(100);
    expect(layout.center.y).toBe(50);
  });

  it("returns no edges without neighbors", () => {
    const ego = buildOntologyEgoSubgraph("a", [node("a")], []);
    const layout = buildRadialEgoLayout(ego, 100, 100);
    expect(layout.neighbors).toHaveLength(0);
    expect(layout.edges).toHaveLength(0);
  });

  it("places 4 neighbors clockwise at 12, 3, 6 and 9 o'clock", () => {
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
    // Index 0 is 12 o'clock.
    expect(layout.neighbors[0]?.y).toBeLessThan(layout.center.y);
    expect(Math.abs(layout.neighbors[0]!.x - layout.center.x)).toBeLessThan(0.001);
    // 3 o'clock.
    expect(layout.neighbors[1]?.x).toBeGreaterThan(layout.center.x);
    // 6 o'clock.
    expect(layout.neighbors[2]?.y).toBeGreaterThan(layout.center.y);
    // 9 o'clock.
    expect(layout.neighbors[3]?.x).toBeLessThan(layout.center.x);
  });

  it("draws an outgoing edge from center to neighbor", () => {
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

  it("derives the radius from padding", () => {
    const ego = buildOntologyEgoSubgraph("a", [node("a"), node("b")], [edge("e", "a", "b")]);
    const layout = buildRadialEgoLayout(ego, 200, 200, { padding: 30 });
    // radius = min(200, 200) / 2 - 30 = 70
    const dx = layout.neighbors[0]!.x - layout.center.x;
    const dy = layout.neighbors[0]!.y - layout.center.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    expect(dist).toBeCloseTo(70, 5);
  });
});

describe("buildRadialEgoLayout two-hop rings", () => {
  it("places hop 1 on the inner ring and hop 2 on the outer ring", () => {
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

  it("draws a hop-2 edge from pivot to far node", () => {
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

  it("draws a hop-2 incoming edge from far node to pivot", () => {
    const ego = buildOntologyEgoSubgraph(
      "c",
      [node("c"), node("a"), node("b")],
      [edge("e1", "c", "a"), edge("e2", "b", "a")], // b → a: b is the hop-2 incoming node.
      { hops: 2 },
    );
    const layout = buildRadialEgoLayout(ego, 200, 200);
    const hop2Edge = layout.edges.find((e) => e.hop === 2)!;
    const pivot = layout.neighbors.find((n) => n.id === "a")!;
    const far = layout.neighbors.find((n) => n.id === "b")!;
    expect(hop2Edge.direction).toBe("incoming");
    // Incoming: from the far node (b) to the pivot (a).
    expect(hop2Edge.from.x).toBeCloseTo(far.x, 5);
    expect(hop2Edge.to.x).toBeCloseTo(pivot.x, 5);
  });

  it("uses a single ring with only 1-hop neighbors", () => {
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
