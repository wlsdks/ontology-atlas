import { describe, expect, it } from "vitest";

import type { TopologyV2Tokens } from "../tokens/read-topology-v2-tokens";
import { buildTopologyWorld } from "./topology-world";
import type { TopologyV2Edge, TopologyV2Node } from "./TopologyMapV2";
import { buildRealmRuntimeData, realmCameraTarget, realmVisibleBounds } from "./topology-realm-runtime";
import { DENSITY_GATE_THRESHOLD } from "../model/density-gate";

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

  it("exposes depthById for every member (root=0) — S5 깊이 연출 런타임 데이터", () => {
    const data = buildRealmRuntimeData(buildFixtureWorld(), "d", tokens)!;
    // 모든 멤버가 깊이를 갖고, 루트는 0.
    expect(new Set(data.depthById.keys())).toEqual(new Set(data.memberIds));
    expect(data.depthById.get("d")).toBe(0);
    // 비루트 멤버는 루트보다 깊다.
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

  // S8 결함 2 — entryCamera 는 빌드 시 null(카메라 미상). 진입 effect 가 채운다.
  it("entryCamera 는 빌드 직후 null 이다 (진입 effect 가 카메라 값으로 채움)", () => {
    const data = buildRealmRuntimeData(buildFixtureWorld(), "d", tokens)!;
    expect(data.entryCamera).toBeNull();
  });

  it("realmCameraTarget centers on the content bbox (결계가 아니라 콘텐츠가 주인공) and clamps scale", () => {
    const data = buildRealmRuntimeData(buildFixtureWorld(), "d", tokens)!;
    // S9 결함 1/2 — realmCameraTarget 은 이제 bounds 를 직접 받는다(가시-멤버 기준).
    const target = realmCameraTarget(data.bounds, tokens, 1000, 800);
    expect(target.tx).toBeCloseTo((data.bounds.minX + data.bounds.maxX) / 2, 4);
    expect(target.ty).toBeCloseTo((data.bounds.minY + data.bounds.maxY) / 2, 4);
    expect(target.tscale).toBeLessThanOrEqual(2.6);
    expect(target.tscale).toBeGreaterThanOrEqual(0.24);
  });
});

/**
 * S9 결함 2 — 밀도 게이트로 접히는 자식(>12 자식 부모의 phyllotaxis 디스크)이
 * 결계 반경·카메라 bbox 를 부풀리지 않는지. 루트 d ⊃ cap c ⊃ (threshold+8) element.
 * cap c 가 접히면 그 element 자식들은 안 보이므로 결계에서 빠져야 한다.
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
    // c 접힘(기본): 루트 d 만 펼침 → c 의 element 자식 전부 clustered.
    const collapsed = buildRealmRuntimeData(world, "d", tokens, new Set(["d"]))!;
    // c 펼침: element 자식이 보이므로 결계가 그만큼 커진다.
    const expanded = buildRealmRuntimeData(world, "d", tokens, new Set(["d", "c"]))!;
    expect(collapsed.wardingRadius).toBeLessThan(expanded.wardingRadius);
    // bbox 도 같은 방향으로 — 접힘이 더 좁다.
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
