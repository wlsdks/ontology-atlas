/**
 * B7 — 노드 최소 분리 완화 (순수, 결정론).
 *
 * Guardian 실증: 클릭→다이브→리빌 여정의 결과 화면에서 리빌된 element 가
 * 프로젝트 육각형 각인과 정면 충돌했다. de-pileup 레이아웃은 링으로
 * 겹침을 피하지만, force sim + 드래그 견인이 자식을 부모 위로 밀 수 있다
 * ("우연히 닿는 픽셀 방치" — design.md AI-느낌 목록).
 *
 * 호출 시점은 caller 규약: **sim 활성(드래그/릴리즈 정착) 프레임에만**.
 * 호밍(자동 정렬·첫 지도 연출) 중에는 돌리지 않는다 — 연출의 의도적
 * 모임 상태를 흩뜨리지 않기 위해서이고, 호밍의 목적지(home)는 이미
 * 비겹침 레이아웃이다.
 */

export interface SeparationNode {
  id: string;
  x: number;
  y: number;
  /** 월드 반지름 (radiusForKind). */
  r: number;
}

export interface SeparationOptions {
  /** `--topology-v2-node-min-separation-ratio` — (rA+rB)×ratio 미만이면 밀어냄. */
  ratio: number;
  /** 완화 반복 횟수 (Guardian 처방 2). */
  iterations: number;
  /** 움직이면 안 되는 노드 (핀 드래그 중인 노드). */
  pinnedId?: string | null;
}

/** 겹친 쌍을 축 방향으로 대칭(핀이면 상대만) 밀어낸다. 노드 배열을 제자리 수정. */
export function relaxNodeSeparation(nodes: SeparationNode[], options: SeparationOptions): void {
  const { ratio, iterations, pinnedId = null } = options;
  for (let iter = 0; iter < iterations; iter += 1) {
    for (let i = 0; i < nodes.length; i += 1) {
      for (let j = i + 1; j < nodes.length; j += 1) {
        const a = nodes[i];
        const b = nodes[j];
        const minDist = (a.r + b.r) * ratio;
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let dist = Math.hypot(dx, dy);
        if (dist >= minDist) continue;
        if (dist < 1e-6) {
          // 완전 동일 좌표 — 결정론적 축 선택 (id 순서 기반 수평 밀기).
          dx = 1;
          dy = 0;
          dist = 1;
        }
        const push = (minDist - dist) / dist;
        const px = dx * push;
        const py = dy * push;
        if (a.id === pinnedId) {
          b.x += px;
          b.y += py;
        } else if (b.id === pinnedId) {
          a.x -= px;
          a.y -= py;
        } else {
          a.x -= px / 2;
          a.y -= py / 2;
          b.x += px / 2;
          b.y += py / 2;
        }
      }
    }
  }
}
