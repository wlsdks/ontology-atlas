import { describe, expect, it } from "vitest";

import { computeTopologyClusterState } from "./topology-cluster-state";
import type { ClusterParentMeta, WorldNode } from "./topology-world";
import { DENSITY_GATE_THRESHOLD } from "../model/density-gate";

/**
 * `computeTopologyClusterState` 는 월드의 정적 클러스터 메타 + 부모의 **라이브**
 * 좌표를 합쳐 순수 게이트를 호출하는 어댑터다. 여기선 (1) 라이브 좌표가 칩
 * anchor 에 반영되는지, (2) 게이트 판정이 그대로 전달되는지만 확인한다
 * (판정 자체의 상세 케이스는 `density-gate.test.ts`).
 */
function node(id: string, x: number, y: number, kind: WorldNode["kind"] = "capability"): WorldNode {
  return {
    id,
    kind,
    label: id,
    parentId: null,
    x,
    y,
    homeX: x,
    homeY: y,
    isHub: false,
    fresh: false,
    stale: false,
    count: 0,
    magnitudeScale: 1,
  };
}

describe("computeTopologyClusterState", () => {
  const childIds = Array.from({ length: DENSITY_GATE_THRESHOLD + 5 }, (_, i) => `cap-${i}`);

  function buildWorld(parentX: number, parentY: number) {
    const nodeById = new Map<string, WorldNode>();
    nodeById.set("d", node("d", parentX, parentY, "domain"));
    for (const id of childIds) nodeById.set(id, node(id, 0, 0));
    const childrenByParent = new Map<string, readonly string[]>([["d", childIds]]);
    // outward = +x 방향, ring 100 → anchor = 부모 + (100, 0)
    const clusterMetaByParent = new Map<string, ClusterParentMeta>([["d", { angle: 0, ring: 100 }]]);
    return { nodeById, childrenByParent, clusterMetaByParent };
  }

  it("미확장: 자식을 접고, 칩 anchor 가 부모의 라이브 좌표를 따른다", () => {
    const world = buildWorld(50, 20);
    const result = computeTopologyClusterState(world, new Set());
    for (const id of childIds) expect(result.clusteredIds.has(id)).toBe(true);
    expect(result.chips).toHaveLength(1);
    // anchor = 부모(50,20) + outward(0)×ring(100) = (150, 20)
    expect(result.chips[0].anchor.x).toBeCloseTo(150, 6);
    expect(result.chips[0].anchor.y).toBeCloseTo(20, 6);
    expect(result.chips[0]).toMatchObject({ parentId: "d", expanded: false, count: childIds.length });
  });

  it("부모가 움직이면(라이브 좌표) 칩 anchor 도 함께 이동한다", () => {
    const moved = computeTopologyClusterState(buildWorld(0, 0), new Set());
    // 부모 (0,0) → anchor (100, 0)
    expect(moved.chips[0].anchor.x).toBeCloseTo(100, 6);
    expect(moved.chips[0].anchor.y).toBeCloseTo(0, 6);
  });

  it("확장: 자식 노출(clustered 없음) + 접기 칩(expanded=true)", () => {
    const result = computeTopologyClusterState(buildWorld(0, 0), new Set(["d"]));
    expect(result.clusteredIds.size).toBe(0);
    expect(result.chips[0].expanded).toBe(true);
  });
});
