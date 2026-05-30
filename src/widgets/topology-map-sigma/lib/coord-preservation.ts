import type Graph from 'graphology';

/**
 * 그래프 rebuild 사이 노드 좌표 보존 — charter 의 perf north-star("증분 업데이트
 * / 좌표 보존").
 *
 * 라이브 변경(노드 추가·삭제·pulse 만료·테마 토글·baseline 변경)으로 graph
 * useMemo 가 재실행되면 `settleLayout`(ForceAtlas2)이 처음부터 다시 돌아 *전체
 * 그래프가 reflow* 한다 — 큰 vault 일수록 끊김 + "뭐가 새로 생겼는지" 가 안 읽힘.
 * 이전 build 의 좌표를 복원하면 기존 노드는 제자리, 새 노드만 settle 위치로
 * 들어와 "여기 새 노드가 돋아났다" 가 또렷이 보인다(wedge 심장).
 *
 * worker-layout-controller 는 그래프의 현재 x/y 로 worker 를 seed 하므로
 * (autoStart 든 static 이든) 여기서 보존한 좌표가 그대로 출발점이 된다.
 *
 * 순수 함수 — graphology 그래프만 받아 mutate/read. 단위 테스트로 고정.
 */

export interface NodeCoord {
  x: number;
  y: number;
}

type CoordAttrs = { x: number; y: number };

/** 현재 그래프의 유한 좌표 노드를 snapshot — 다음 rebuild 의 복원 기준. */
export function snapshotNodeCoords<N extends CoordAttrs>(
  graph: Graph<N>,
): Map<string, NodeCoord> {
  const out = new Map<string, NodeCoord>();
  graph.forEachNode((id, attrs) => {
    if (Number.isFinite(attrs.x) && Number.isFinite(attrs.y)) {
      out.set(id, { x: attrs.x, y: attrs.y });
    }
  });
  return out;
}

/**
 * 캐시된 좌표를 현재 그래프에 복원 — 캐시에 있는(=이전에 존재하던) 노드만 제자리로,
 * 새 노드는 settle 좌표 그대로 둔다. 반환값 = 복원된 노드 수.
 */
export function restoreNodeCoords<N extends CoordAttrs>(
  graph: Graph<N>,
  coords: ReadonlyMap<string, NodeCoord>,
): number {
  let restored = 0;
  coords.forEach((pos, id) => {
    if (graph.hasNode(id) && Number.isFinite(pos.x) && Number.isFinite(pos.y)) {
      graph.setNodeAttribute(id, 'x' as keyof N, pos.x as N[keyof N]);
      graph.setNodeAttribute(id, 'y' as keyof N, pos.y as N[keyof N]);
      restored += 1;
    }
  });
  return restored;
}
