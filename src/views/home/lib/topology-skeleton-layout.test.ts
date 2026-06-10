import { describe, expect, it } from "vitest";
import type { KnowledgeGraphNode } from "@/entities/knowledge-graph";
import type { OntologySkeleton } from "./topology-ontology-skeleton";
import type { RevealState } from "./topology-reveal-state";
import {
  buildRevealRadialLayout,
  buildSkeletonRadialLayout,
} from "./topology-skeleton-layout";

function n(id: string, kind: string): KnowledgeGraphNode {
  return {
    id,
    title: id,
    kind,
    projectIds: [],
    evidenceIds: [],
    lastApprovedAt: new Date("2026-01-01T00:00:00Z"),
    lastApprovedBy: "stark",
  };
}

/** A resolved skeleton: 1 project, 2 domains, 3 landmarks (2 under d1, 1 under d2). */
function skeleton(): { skeleton: OntologySkeleton; nodes: KnowledgeGraphNode[] } {
  const nodes = [
    n("p", "project"),
    n("d1", "domain"),
    n("d2", "domain"),
    n("c1", "capability"),
    n("c2", "capability"),
    n("c5", "capability"),
  ];
  const levelBySlug = new Map<string, "anchor" | "landmark" | "hidden">([
    ["p", "anchor"],
    ["d1", "anchor"],
    ["d2", "anchor"],
    ["c1", "landmark"],
    ["c2", "landmark"],
    ["c5", "landmark"],
  ]);
  const skel: OntologySkeleton = {
    skeletonSlugs: new Set(["p", "d1", "d2", "c1", "c2", "c5"]),
    levelBySlug,
    subtreeWeightBySlug: new Map(),
    landmarksByDomain: new Map([
      ["d1", ["c1", "c2"]],
      ["d2", ["c5"]],
    ]),
    overflowByDomain: new Map(),
  };
  return { skeleton: skel, nodes };
}

const dist = (
  p: { x: number; y: number },
  c: { x: number; y: number },
): number => Math.hypot(p.x - c.x, p.y - c.y);

describe("buildSkeletonRadialLayout", () => {
  it("places the project at the center", () => {
    const { skeleton: s, nodes } = skeleton();
    const layout = buildSkeletonRadialLayout(s, nodes, { width: 1000, height: 1000 });
    const p = layout.pointById.get("p")!;
    expect(p.tier).toBe(0);
    expect(p.x).toBeCloseTo(layout.center.x);
    expect(p.y).toBeCloseTo(layout.center.y);
  });

  it("places domains on ring 1 at an equal radius from the center", () => {
    const { skeleton: s, nodes } = skeleton();
    const layout = buildSkeletonRadialLayout(s, nodes, { width: 1000, height: 1000 });
    const d1 = layout.pointById.get("d1")!;
    const d2 = layout.pointById.get("d2")!;
    expect(d1.tier).toBe(1);
    expect(d2.tier).toBe(1);
    const r1 = dist(d1, layout.center);
    expect(dist(d2, layout.center)).toBeCloseTo(r1);
    expect(r1).toBeGreaterThan(0);
  });

  it("places landmarks on ring 2 — farther out than the domains", () => {
    const { skeleton: s, nodes } = skeleton();
    const layout = buildSkeletonRadialLayout(s, nodes, { width: 1000, height: 1000 });
    const r1 = dist(layout.pointById.get("d1")!, layout.center);
    const r2 = dist(layout.pointById.get("c1")!, layout.center);
    expect(layout.pointById.get("c1")!.tier).toBe(2);
    expect(r2).toBeGreaterThan(r1);
    // every landmark shares the same outer radius
    expect(dist(layout.pointById.get("c2")!, layout.center)).toBeCloseTo(r2);
    expect(dist(layout.pointById.get("c5")!, layout.center)).toBeCloseTo(r2);
  });

  it("clusters a domain's landmarks around that domain's angle (not scattered)", () => {
    const { skeleton: s, nodes } = skeleton();
    const layout = buildSkeletonRadialLayout(s, nodes, { width: 1000, height: 1000 });
    const angleOf = (id: string) => {
      const pt = layout.pointById.get(id)!;
      return Math.atan2(pt.y - layout.center.y, pt.x - layout.center.x);
    };
    // c1, c2 belong to d1 → their angles bracket d1's angle closely;
    // c5 (d2) sits near d2's angle, away from d1's landmarks.
    const dd1 = angleOf("d1");
    const near = (a: number, b: number) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
    expect(near(angleOf("c1"), dd1)).toBeLessThan(near(angleOf("c1"), angleOf("d2")));
    expect(near(angleOf("c2"), dd1)).toBeLessThan(near(angleOf("c2"), angleOf("d2")));
  });

  it("aspectX 는 x 만 늘린다 — 와이드 뷰포트용 타원 (y 불변)", () => {
    const { skeleton: s, nodes } = skeleton();
    const round = buildSkeletonRadialLayout(s, nodes, { width: 1000, height: 1000 });
    const wide = buildSkeletonRadialLayout(s, nodes, {
      width: 1000,
      height: 1000,
      aspectX: 1.5,
    });
    for (const pt of round.points) {
      const stretched = wide.pointById.get(pt.id)!;
      const dx = pt.x - round.center.x;
      expect(stretched.x - wide.center.x).toBeCloseTo(dx * 1.5);
      expect(stretched.y).toBeCloseTo(pt.y);
    }
  });

  it("is deterministic — identical coordinates across runs (replay-safe)", () => {
    const { skeleton: s, nodes } = skeleton();
    const a = buildSkeletonRadialLayout(s, nodes, { width: 1000, height: 1000 });
    const b = buildSkeletonRadialLayout(s, nodes, { width: 1000, height: 1000 });
    expect(a.points).toEqual(b.points);
  });

  it("only lays out skeleton nodes (hidden nodes get no point)", () => {
    const { skeleton: s, nodes } = skeleton();
    const withHidden = [...nodes, n("e1", "element")];
    const layout = buildSkeletonRadialLayout(s, withHidden, { width: 1000, height: 1000 });
    expect(layout.pointById.has("e1")).toBe(false);
    expect(layout.points).toHaveLength(6);
  });
});

function revealState(overrides: Partial<RevealState>): RevealState {
  return {
    scopeDomainSlug: null,
    scopeCapabilitySlug: null,
    visibleSlugs: new Set(),
    revealedSlugs: new Set(),
    domainCapabilitySlugs: [],
    capabilityElementSlugs: [],
    crumbSlugs: [],
    ...overrides,
  };
}

describe("buildRevealRadialLayout — 클릭-레벨 확장 좌표(결정론)", () => {
  it("scope 없음 → 골격 레이아웃과 동일", () => {
    const { skeleton: s, nodes } = skeleton();
    const base = buildSkeletonRadialLayout(s, nodes, { width: 1000, height: 1000 });
    const layout = buildRevealRadialLayout(s, nodes, revealState({}), {
      width: 1000,
      height: 1000,
    });
    expect(layout.points).toEqual(base.points);
  });

  it("도메인 scope → 그 도메인의 모든 역량이 outer ring 위 wedge 안에 배치, anchor 좌표는 불변", () => {
    const { skeleton: s, nodes } = skeleton();
    const withC3 = [...nodes, n("c3", "capability")];
    const base = buildSkeletonRadialLayout(s, withC3, { width: 1000, height: 1000 });
    const layout = buildRevealRadialLayout(
      s,
      withC3,
      revealState({
        scopeDomainSlug: "d1",
        domainCapabilitySlugs: ["c1", "c2", "c3"],
        revealedSlugs: new Set(["c3"]),
      }),
      { width: 1000, height: 1000 },
    );
    // anchor(project/domain) 좌표 불변 — 확장해도 골격이 안 흔들린다.
    expect(layout.pointById.get("p")).toEqual(base.pointById.get("p"));
    expect(layout.pointById.get("d1")).toEqual(base.pointById.get("d1"));
    expect(layout.pointById.get("d2")).toEqual(base.pointById.get("d2"));
    // 다른 도메인의 landmark 도 불변.
    expect(layout.pointById.get("c5")).toEqual(base.pointById.get("c5"));
    // 새로 드러난 c3 가 outer ring 반경에 배치된다.
    const c3 = layout.pointById.get("c3")!;
    expect(c3.tier).toBe(2);
    const rOuter = dist(layout.pointById.get("c5")!, layout.center);
    expect(dist(c3, layout.center)).toBeCloseTo(rOuter);
    // d1 wedge 안: c3 의 각도가 d2 보다 d1 에 가깝다.
    const angleOf = (pt: { x: number; y: number }) =>
      Math.atan2(pt.y - layout.center.y, pt.x - layout.center.x);
    const near = (a: number, b: number) =>
      Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
    const d1a = angleOf(layout.pointById.get("d1")!);
    const d2a = angleOf(layout.pointById.get("d2")!);
    expect(near(angleOf(c3), d1a)).toBeLessThan(near(angleOf(c3), d2a));
  });

  it("역량 scope → 요소가 tier 3 으로 outer ring 보다 바깥에, 역량 각도 주변에 배치", () => {
    const { skeleton: s, nodes } = skeleton();
    const withElements = [...nodes, n("e1", "element"), n("e2", "element")];
    const layout = buildRevealRadialLayout(
      s,
      withElements,
      revealState({
        scopeDomainSlug: "d1",
        scopeCapabilitySlug: "c1",
        domainCapabilitySlugs: ["c1", "c2"],
        capabilityElementSlugs: ["e1", "e2"],
        revealedSlugs: new Set(["e1", "e2"]),
      }),
      { width: 1000, height: 1000 },
    );
    const c1 = layout.pointById.get("c1")!;
    const e1 = layout.pointById.get("e1")!;
    const e2 = layout.pointById.get("e2")!;
    expect(e1.tier).toBe(3);
    expect(e2.tier).toBe(3);
    const rCap = dist(c1, layout.center);
    expect(dist(e1, layout.center)).toBeGreaterThan(rCap);
    expect(dist(e2, layout.center)).toBeGreaterThan(rCap);
    // 요소 호의 중심 = 역량 각도.
    const angleOf = (pt: { x: number; y: number }) =>
      Math.atan2(pt.y - layout.center.y, pt.x - layout.center.x);
    const near = (a: number, b: number) =>
      Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
    const c1a = angleOf(c1);
    expect(near(angleOf(e1), c1a)).toBeLessThan(0.5);
    expect(near(angleOf(e2), c1a)).toBeLessThan(0.5);
  });

  it("결정론 — 같은 입력이면 좌표 replay-identical", () => {
    const { skeleton: s, nodes } = skeleton();
    const withElements = [...nodes, n("e1", "element")];
    const state = revealState({
      scopeDomainSlug: "d1",
      scopeCapabilitySlug: "c1",
      domainCapabilitySlugs: ["c1", "c2"],
      capabilityElementSlugs: ["e1"],
      revealedSlugs: new Set(["e1"]),
    });
    const a = buildRevealRadialLayout(s, withElements, state, { width: 1000, height: 1000 });
    const b = buildRevealRadialLayout(s, withElements, state, { width: 1000, height: 1000 });
    expect(a.points).toEqual(b.points);
  });
});
