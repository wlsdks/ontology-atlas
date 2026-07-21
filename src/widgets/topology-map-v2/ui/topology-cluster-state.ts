/**
 * 밀도 게이트 슬라이스 (fable 설계) — 월드의 정적 클러스터 메타
 * (`topology-world.ts` 의 `childrenByParent` / `clusterMetaByParent`) 와 부모의
 * *라이브* 좌표를 합쳐 순수 `computeDensityGate` 를 호출하는 얇은 어댑터.
 *
 * anchor 를 매 프레임 라이브 위치로 다시 계산하는 이유: 드래그/살아있는
 * 그래프가 부모를 옮기면 칩도 함께 따라가야 하기 때문(정적 anchor 는 어긋난다).
 * 판정 로직(누가 접히는가/칩이 나오는가)은 전부 순수 모델(`density-gate.ts`)에
 * 있고, 이 파일은 좌표 주입만 담당한다.
 */

import {
  computeDensityGate,
  type DensityGateParentGeometry,
  type DensityGateResult,
} from "../model/density-gate";
import type { TopologyWorld } from "./topology-world";

export function computeTopologyClusterState(
  world: Pick<TopologyWorld, "nodeById" | "childrenByParent" | "clusterMetaByParent">,
  expandedParents: ReadonlySet<string>,
): DensityGateResult {
  const parentGeometry = new Map<string, DensityGateParentGeometry>();
  for (const [parentId, meta] of world.clusterMetaByParent) {
    const parent = world.nodeById.get(parentId);
    if (!parent) continue;
    parentGeometry.set(parentId, {
      x: parent.x,
      y: parent.y,
      angle: meta.angle,
      ring: meta.ring,
    });
  }
  return computeDensityGate({
    childrenByParent: world.childrenByParent,
    expandedParents,
    parentGeometry,
  });
}
