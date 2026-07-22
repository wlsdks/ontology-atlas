import { describe, expect, it } from "vitest";

import type { TopologyV2Tokens } from "../tokens/read-topology-v2-tokens";
import { buildTopologyWorld } from "./topology-world";
import type { TopologyV2Edge, TopologyV2Node } from "./TopologyMapV2";
import { buildRealmRuntimeData, realmCameraTarget } from "./topology-realm-runtime";

const tokens = {
  radiusProject: 20,
  radiusDomain: 14,
  radiusCapability: 8,
  radiusElement: 5,
  layoutRingDomain: 250,
  layoutRingCapability: 145,
  layoutRingElement: 90,
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
 * 픽스처: project p ⊃ domain d(⊃ cap c ⊃ el e) + 형제 domain d2(⊃ el x).
 * 영역 루트 = d 이면 멤버 {d, c, e}, 밖 = {p, d2, x}.
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
    // 루트는 재배치 원점.
    expect(data!.insideTargets.get("d")).toEqual({ x: 0, y: 0 });
    // fling 중력 중심 = 루트의 원래 위치.
    expect(data!.flingCenter).toEqual({ x: world.nodeById.get("d")!.homeX, y: world.nodeById.get("d")!.homeY });
    // 결계는 원점 중심 + 양수 반경.
    expect(data!.wardingCenter).toEqual({ x: 0, y: 0 });
    expect(data!.wardingRadius).toBeGreaterThan(0);
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

  it("realmCameraTarget centers on the content bbox (결계가 아니라 콘텐츠가 주인공) and clamps scale", () => {
    const data = buildRealmRuntimeData(buildFixtureWorld(), "d", tokens)!;
    const target = realmCameraTarget(data, tokens, 1000, 800);
    expect(target.tx).toBeCloseTo((data.bounds.minX + data.bounds.maxX) / 2, 4);
    expect(target.ty).toBeCloseTo((data.bounds.minY + data.bounds.maxY) / 2, 4);
    expect(target.tscale).toBeLessThanOrEqual(2.6);
    expect(target.tscale).toBeGreaterThanOrEqual(0.24);
  });
});
