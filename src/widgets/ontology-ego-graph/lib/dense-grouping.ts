import type { OntologyEgoNeighbor } from "@/shared/lib/ontology-tree";
import { EGO_LABEL_DENSE_THRESHOLD } from "./label-visibility";

/**
 * dense ego 대응 — kind 별 overflow 요약. 개별 dot 으로 안 그리고 남은
 * 개수만 들고 있다가 UI 가 "{kind} +{count}" 칩으로 렌더.
 */
export interface EgoOverflowGroup {
  hop: 1 | 2;
  kind: string;
  count: number;
}

export interface DenseEgoGrouping {
  /** 실제로 ring 에 그릴 (제한된) neighbor 목록 — hop=1 먼저, hop=2 다음. */
  visible: OntologyEgoNeighbor[];
  /** kind 별로 접힌 나머지. 빈 배열 = dense 아님 (원본 그대로 통과). */
  overflow: EgoOverflowGroup[];
}

/**
 * ring 하나(같은 hop)당 kind 별로 남기는 최대 개수. 8~10 권장 범위의
 * 중간값 — 라벨이 겹치지 않을 만큼 작으면서 "이 kind 에 뭐가 있는지"
 * 감 잡기엔 충분한 수.
 */
export const EGO_DENSE_GROUPING_DEFAULT_PER_KIND_CAP = 8;

function neighborKind(neighbor: OntologyEgoNeighbor): string {
  return neighbor.node?.kind ?? "unknown";
}

/**
 * ring 하나(hop 고정) 를 kind 별로 그룹 짓고 그룹당 `perKindCap` 개만
 * 남긴다. threshold(`EGO_LABEL_DENSE_THRESHOLD`) 이하면 원본 그대로 통과
 * — 회귀 없음 (기존 <12 ego 는 지금과 똑같이 보인다).
 *
 * kind 순서는 입력에서 처음 등장한 순서 그대로 유지 (build-ego 의 안정적인
 * outgoing→incoming→hop2 정렬을 그대로 반영, 임의 재정렬 없음).
 */
function capRing(
  ring: OntologyEgoNeighbor[],
  hop: 1 | 2,
  perKindCap: number,
): { visible: OntologyEgoNeighbor[]; overflow: EgoOverflowGroup[] } {
  if (ring.length <= EGO_LABEL_DENSE_THRESHOLD) {
    return { visible: ring, overflow: [] };
  }

  const kindOrder: string[] = [];
  const byKind = new Map<string, OntologyEgoNeighbor[]>();
  for (const item of ring) {
    const kind = neighborKind(item);
    if (!byKind.has(kind)) {
      byKind.set(kind, []);
      kindOrder.push(kind);
    }
    byKind.get(kind)!.push(item);
  }

  const visible: OntologyEgoNeighbor[] = [];
  const overflow: EgoOverflowGroup[] = [];
  for (const kind of kindOrder) {
    const group = byKind.get(kind)!;
    const kept = group.slice(0, perKindCap);
    visible.push(...kept);
    const remainder = group.length - kept.length;
    if (remainder > 0) {
      overflow.push({ hop, kind, count: remainder });
    }
  }
  return { visible, overflow };
}

/**
 * ego neighbor 전체를 dense-scale 대응 kind-grouped 형태로 축소.
 *
 * 1-hop / 2-hop 링을 독립적으로 취급한다 — dogfood 의 `capability:mcp-server`
 * 처럼 1-hop(34) 은 dense 이고 2-hop(194) 은 훨씬 더 dense 인 비대칭 케이스가
 * 흔하다. 194개 점을 다 그리는 moiré ring 은 절대 만들지 않는다: 한 kind 당
 * `perKindCap` 개만 그리고, 나머지는 kind 별 overflow 카운트로 접는다.
 *
 * Shneiderman 의 overview-first — 세부는 필요할 때(neighbor 리스트 / "+N"
 * 클릭)만 연다.
 */
export function groupEgoNeighborsForDenseRing(
  neighbors: OntologyEgoNeighbor[],
  perKindCap: number = EGO_DENSE_GROUPING_DEFAULT_PER_KIND_CAP,
): DenseEgoGrouping {
  const hop1 = neighbors.filter((n) => n.hop === 1);
  const hop2 = neighbors.filter((n) => n.hop === 2);
  const cappedHop1 = capRing(hop1, 1, perKindCap);
  const cappedHop2 = capRing(hop2, 2, perKindCap);
  return {
    visible: [...cappedHop1.visible, ...cappedHop2.visible],
    overflow: [...cappedHop1.overflow, ...cappedHop2.overflow],
  };
}
