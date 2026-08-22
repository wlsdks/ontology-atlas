import { describe, expect, it } from "vitest";

import type { TopologyV2Tokens } from "../tokens/read-topology-v2-tokens";
import { buildTopologyWorld } from "./topology-world";
import type { TopologyV2Edge, TopologyV2Node } from "./TopologyMapV2";
import { buildRealmRuntimeData, realmCameraTarget, realmVisibleBounds } from "./topology-realm-runtime";
import { DENSITY_GATE_THRESHOLD } from "../model/density-gate";
import { computeRealmLayout, extractRealmSubtree } from "../model/realm";
import type { LayoutRings } from "../model/layout";

const tokens = {
  radiusProject: 20,
  radiusDomain: 14,
  radiusCapability: 8,
  radiusElement: 5,
  layoutRingDomain: 250,
  layoutRingCapability: 145,
  layoutRingElement: 90,
  realmFillRadius1: 130,
  realmFillRadius2: 190,
  realmFillRadius3: 250,
  edgeBowContains: 70,
  edgeBowDepends: 92,
  edgeBlendContains: 0.46,
  edgeBlendDepends: 0.62,
  starCount: 2,
  radiusMagnitudeK: 0,
  cameraScaleMax: 2.6,
  cameraScaleMin: 0.24,
  safeInsetLeft: 0,
  safeInsetRight: 0,
  safeInsetTop: 0,
  safeInsetBottom: 0,
} as unknown as TopologyV2Tokens;

function inputNode(partial: Partial<TopologyV2Node> & Pick<TopologyV2Node, "id" | "kind">): TopologyV2Node {
  return {
    label: partial.id,
    size: 1,
    x: 0,
    y: 0,
    isHub: false,
    ownerKey: null,
    recentlyUpdated: false,
    fullDegree: 0,
    descendantCount: 0,
    ...partial,
  };
}

function containsEdge(source: string, target: string): TopologyV2Edge {
  return { source, target, relationType: "contains", relationQuality: null, evidenceCount: 0, kind: "contains", declaredBySlug: null };
}

/**
 * Fixture: project p ⊃ domain d (⊃ cap c ⊃ el e) + sibling domain d2 (⊃ el x).
 * With the realm root at d, the members are {d, c, e} and the outside is {p, d2, x}.
 */
function buildFixtureWorld() {
  const nodes: TopologyV2Node[] = [
    inputNode({ id: "p", kind: "project" }),
    inputNode({ id: "d", kind: "domain" }),
    inputNode({ id: "c", kind: "capability" }),
    inputNode({ id: "e", kind: "element" }),
    inputNode({ id: "d2", kind: "domain" }),
    inputNode({ id: "x", kind: "element" }),
  ];
  const edges: TopologyV2Edge[] = [
    containsEdge("p", "d"),
    containsEdge("d", "c"),
    containsEdge("c", "e"),
    containsEdge("p", "d2"),
    containsEdge("d2", "x"),
  ];
  return buildTopologyWorld(nodes, edges, tokens);
}

describe("buildRealmRuntimeData", () => {
  it("splits members from outside and re-roots the subtree at the origin", () => {
    const world = buildFixtureWorld();
    const data = buildRealmRuntimeData(world, "d", tokens);
    expect(data).not.toBeNull();
    expect([...data!.memberIds].sort()).toEqual(["c", "d", "e"]);
    expect([...data!.outsideIds].sort()).toEqual(["d2", "p", "x"]);
    // The root is the re-layout origin.
    expect(data!.insideTargets.get("d")).toEqual({ x: 0, y: 0 });
    // The fling's gravity centre = the root's original position.
    expect(data!.flingCenter).toEqual({ x: world.nodeById.get("d")!.homeX, y: world.nodeById.get("d")!.homeY });
    // The warding circle is centred on the origin with a positive radius.
    expect(data!.wardingCenter).toEqual({ x: 0, y: 0 });
    expect(data!.wardingRadius).toBeGreaterThan(0);
  });

  it("exposes depthById for every member (root=0) — S5 깊이 연출 런타임 데이터", () => {
    const data = buildRealmRuntimeData(buildFixtureWorld(), "d", tokens)!;
    // Every member has a depth, and the root's is 0.
    expect(new Set(data.depthById.keys())).toEqual(new Set(data.memberIds));
    expect(data.depthById.get("d")).toBe(0);
    // A non-root member is deeper than the root.
    for (const id of data.memberIds) {
      if (id !== "d") expect(data.depthById.get(id)!).toBeGreaterThan(0);
    }
  });

  it("is deterministic (same world + root → identical warding radius)", () => {
    const a = buildRealmRuntimeData(buildFixtureWorld(), "d", tokens)!;
    const b = buildRealmRuntimeData(buildFixtureWorld(), "d", tokens)!;
    expect(a.wardingRadius).toBe(b.wardingRadius);
    expect([...a.insideTargets.entries()]).toEqual([...b.insideTargets.entries()]);
  });

  it("returns null when the root is not in the world", () => {
    expect(buildRealmRuntimeData(buildFixtureWorld(), "missing", tokens)).toBeNull();
  });

  // S8 defect 2 — entryCamera is null at build time (the camera is unknown). The entry effect fills it.
  it("entryCamera 는 빌드 직후 null 이다 (진입 effect 가 카메라 값으로 채움)", () => {
    const data = buildRealmRuntimeData(buildFixtureWorld(), "d", tokens)!;
    expect(data.entryCamera).toBeNull();
  });

  it("realmCameraTarget centers on the content bbox (결계가 아니라 콘텐츠가 주인공) and clamps scale", () => {
    const data = buildRealmRuntimeData(buildFixtureWorld(), "d", tokens)!;
  // S9 defects 1/2 — realmCameraTarget now takes bounds directly (on the visible-member basis).
    const target = realmCameraTarget(data.bounds, tokens, 1000, 800);
    expect(target.tx).toBeCloseTo((data.bounds.minX + data.bounds.maxX) / 2, 4);
    expect(target.ty).toBeCloseTo((data.bounds.minY + data.bounds.maxY) / 2, 4);
    expect(target.tscale).toBeLessThanOrEqual(2.6);
    expect(target.tscale).toBeGreaterThanOrEqual(0.24);
  });
});

/**
 * Slice A — whether the realm ring derives from the subtree's maximum depth. A
 * shallow subtree (a capability root with 2 element children, maxDepth = 1) has to be
 * pulled in to 130 (`realmFillRadius1`) rather than the global spine ring of 250, or
 * an empty annulus is left (owner report, 2026-07-23).
 */
describe("buildRealmRuntimeData — depth-derived realm ring fill (Slice A)", () => {
  function buildShallowCapabilityWorld() {
    const nodes: TopologyV2Node[] = [
      inputNode({ id: "c", kind: "capability" }),
      inputNode({ id: "e1", kind: "element" }),
      inputNode({ id: "e2", kind: "element" }),
    ];
    const edges: TopologyV2Edge[] = [containsEdge("c", "e1"), containsEdge("c", "e2")];
    return buildTopologyWorld(nodes, edges, tokens);
  }

  it("pulls a shallow (maxDepth=1) realm's depth-1 children to ≈130, not the 250 global spine ring", () => {
    const world = buildShallowCapabilityWorld();
    const data = buildRealmRuntimeData(world, "c", tokens)!;
    for (const id of ["e1", "e2"]) {
      const p = data.insideTargets.get(id)!;
      const r = Math.hypot(p.x, p.y);
      expect(r).toBeCloseTo(tokens.realmFillRadius1, 0);
      expect(r).toBeLessThan(tokens.layoutRingDomain);
    }
  });

  it("tightens the warding radius for the shallow realm (no longer stretched to the 250-ring scale)", () => {
    const world = buildShallowCapabilityWorld();
    const shallow = buildRealmRuntimeData(world, "c", tokens)!;
    // The children sit at a radius of ~130, so the warding circle should be near that
    // — distinctly smaller than what a 250 spine basis would require (> 250).
    expect(shallow.wardingRadius).toBeLessThan(tokens.layoutRingDomain);
  });

  it("leaves a deep (maxDepth≥3) realm's coordinates identical to the unscaled base rings — regression guard", () => {
    const world = buildFixtureWorld();
    const data = buildRealmRuntimeData(world, "p", tokens)!;
    // p ⊃ d(⊃ c ⊃ e) + p ⊃ d2(⊃ x) — maxDepth from "p" is 3 (p→d→c→e), so
    // realmRingsForDepth caps at depth3 → s=1 → base rings unscaled.
    const childrenByParent = new Map<string, string[]>([
      ["p", ["d", "d2"]],
      ["d", ["c"]],
      ["c", ["e"]],
      ["d2", ["x"]],
    ]);
    const subtree = extractRealmSubtree("p", childrenByParent);
    const baseRings: LayoutRings = {
      domain: tokens.layoutRingDomain,
      capability: tokens.layoutRingCapability,
      element: tokens.layoutRingElement,
    };
    const expected = computeRealmLayout(subtree, baseRings, {
      project: tokens.radiusProject,
      domain: tokens.radiusDomain,
      capability: tokens.radiusCapability,
      element: tokens.radiusElement,
    });
    for (const [id, p] of expected) {
      expect(data.insideTargets.get(id)).toEqual({ x: p.x, y: p.y });
    }
  });
});

/**
 * S9 defect 2 — whether children the density gate collapses (the phyllotaxis disc
 * under a parent with >12 children) inflate the warding radius and camera bbox. Root
 * d ⊃ cap c ⊃ (threshold + 8) elements. When cap c collapses its element children are
 * invisible, so they have to drop out of the warding circle.
 */
describe("buildRealmRuntimeData — 가시 멤버 기준 결계/프레이밍 (S9 결함 2)", () => {
  function buildDenseWorld() {
    const childIds = Array.from({ length: DENSITY_GATE_THRESHOLD + 8 }, (_, i) => `el-${i}`);
    const nodes: TopologyV2Node[] = [
      inputNode({ id: "d", kind: "domain" }),
      inputNode({ id: "c", kind: "capability" }),
      ...childIds.map((id) => inputNode({ id, kind: "element" })),
    ];
    const edges: TopologyV2Edge[] = [
      containsEdge("d", "c"),
      ...childIds.map((id) => containsEdge("c", id)),
    ];
    return { world: buildTopologyWorld(nodes, edges, tokens), childIds };
  }

  it("접힌 자식은 결계 반경을 부풀리지 않는다 (펼침 vs 접힘 반경 비교)", () => {
    const { world } = buildDenseWorld();
    // c collapsed (the default): only root d is expanded → every element child of c is clustered.
    const collapsed = buildRealmRuntimeData(world, "d", tokens, new Set(["d"]))!;
    // c expanded: the element children are visible, so the warding circle grows to match.
    const expanded = buildRealmRuntimeData(world, "d", tokens, new Set(["d", "c"]))!;
    expect(collapsed.wardingRadius).toBeLessThan(expanded.wardingRadius);
    // The bbox moves the same way — collapsed is narrower.
    const wCollapsed = collapsed.bounds.maxX - collapsed.bounds.minX;
    const wExpanded = expanded.bounds.maxX - expanded.bounds.minX;
    expect(wCollapsed).toBeLessThan(wExpanded);
  });

  it("realmVisibleBounds 는 칩 확장/접힘에 따라 프레이밍을 재적합한다", () => {
    const { world } = buildDenseWorld();
    const data = buildRealmRuntimeData(world, "d", tokens, new Set(["d"]))!;
    const collapsedBounds = realmVisibleBounds(world, data, new Set(["d"]), tokens);
    const expandedBounds = realmVisibleBounds(world, data, new Set(["d", "c"]), tokens);
    const wCollapsed = collapsedBounds.maxX - collapsedBounds.minX;
    const wExpanded = expandedBounds.maxX - expandedBounds.minX;
    expect(wCollapsed).toBeLessThan(wExpanded);
  });
});
