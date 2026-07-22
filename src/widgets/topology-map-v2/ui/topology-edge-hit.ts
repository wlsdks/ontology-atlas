/**
 * P3b — 엣지 히트테스트 (순수 수학, DOM/캔버스 무접촉).
 *
 * 레퍼런스 연구 판정(edge-meaning-refs): "엣지 = 선택 가능한 1급 객체 +
 * 패널 상세"가 업계 표준형(Kumu/Bloom/Foundry) — 그 첫 단추가 이 모듈이다.
 * 노드 히트가 항상 우선한다(호출자 규약): 노드가 잡히지 않은 지점에서만
 * 엣지 근접을 판정한다.
 *
 * 성능: AABB 프리패스(껍질 bbox + 임계) 후 통과한 엣지만 2차 베지어를
 * 균등 샘플링해 세그먼트 체인 거리로 판정 — 기술 검수 실측 기준
 * ~500 엣지에 수십 µs/이벤트, 프레임 예산 <1ms 여유 (공간 분할 불필요).
 */

import type { WorldEdge } from "./topology-world";

export interface EdgeHitPoint {
  x: number;
  y: number;
}

const SAMPLE_STEPS = 16;

function distSqToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const vx = bx - ax;
  const vy = by - ay;
  const wx = px - ax;
  const wy = py - ay;
  const len2 = vx * vx + vy * vy;
  const t = len2 > 0 ? Math.min(1, Math.max(0, (wx * vx + wy * vy) / len2)) : 0;
  const cx = ax + vx * t;
  const cy = ay + vy * t;
  const dx = px - cx;
  const dy = py - cy;
  return dx * dx + dy * dy;
}

/** 2차 베지어(끝점 a/b + 제어점 c) 위 점 — 스크린 좌표. */
function bezier(ax: number, ay: number, cx: number, cy: number, bx: number, by: number, t: number): EdgeHitPoint {
  const u = 1 - t;
  return {
    x: u * u * ax + 2 * u * t * cx + t * t * bx,
    y: u * u * ay + 2 * u * t * cy + t * t * by,
  };
}

export interface EdgeHitCandidate {
  edge: WorldEdge;
  /** 스크린 공간 투영 결과 — 호출자(포인터 핸들러)가 world→screen 변환을 소유. */
  a: EdgeHitPoint;
  b: EdgeHitPoint;
  control: EdgeHitPoint;
  /**
   * 히트테스트 역전 방지(패널3-S3) — 양 끝 노드의 **스크린 몸통 반경**(px).
   * 엣지 앵커(`a`/`b`)는 곧 끝 노드의 중심이므로, 이 반경 안쪽 구간은 노드
   * 몸통 영역이다. "노드 바디 > 엣지" 규약을 기하로 강제한다: (1) 클릭이 끝
   * 노드 몸통 안이면 그 엣지는 히트 대상에서 제외(노드가 소유), (2) 노드
   * 몸통 안에 든 베지어 샘플 구간은 히트 거리 계산에서 제외해, 노드 정중앙/
   * 근접 클릭이 방사형 엣지로 새는 것을 막는다. 생략 시 예전 동작(전 구간
   * 히트) 그대로 — 순수 테스트 하위호환.
   */
  aRadius?: number;
  bRadius?: number;
}

function withinRadius(px: number, py: number, cx: number, cy: number, radius: number | undefined): boolean {
  if (radius === undefined || radius <= 0) return false;
  const dx = px - cx;
  const dy = py - cy;
  return dx * dx + dy * dy <= radius * radius;
}

/**
 * `(screenX, screenY)` 에서 `thresholdPx` 안의 가장 가까운 엣지.
 * 없으면 null. 후보는 화면에 그려진(컬링 통과) 엣지만 넘기는 것이 호출자
 * 책임 — 안 보이는 엣지가 클릭되는 것은 계약 위반이다.
 *
 * 노드 우선(패널3-S3): `aRadius`/`bRadius` 가 주어지면 그 반경 안(노드 몸통)의
 * 클릭·구간은 엣지 히트에서 배제한다 — 노드 클릭이 엣지 패널을 여는 역전 차단.
 */
export function hitTestEdges(
  candidates: readonly EdgeHitCandidate[],
  screenX: number,
  screenY: number,
  thresholdPx: number,
): WorldEdge | null {
  const threshold2 = thresholdPx * thresholdPx;
  let best: WorldEdge | null = null;
  let bestD2 = threshold2;
  for (const { edge, a, b, control, aRadius, bRadius } of candidates) {
    // 노드 바디 > 엣지 — 클릭이 어느 끝 노드 몸통 안이면 그 자리는 노드
    // 소유다. 이 엣지는 히트 후보에서 통째로 제외(역전의 근본 차단).
    if (withinRadius(screenX, screenY, a.x, a.y, aRadius) || withinRadius(screenX, screenY, b.x, b.y, bRadius)) {
      continue;
    }
    // AABB 프리패스 — 껍질 bbox 가 임계 밖이면 샘플링 생략.
    const minX = Math.min(a.x, b.x, control.x) - thresholdPx;
    const maxX = Math.max(a.x, b.x, control.x) + thresholdPx;
    const minY = Math.min(a.y, b.y, control.y) - thresholdPx;
    const maxY = Math.max(a.y, b.y, control.y) + thresholdPx;
    if (screenX < minX || screenX > maxX || screenY < minY || screenY > maxY) continue;

    let prev = bezier(a.x, a.y, control.x, control.y, b.x, b.y, 0);
    let prevInNode = withinRadius(prev.x, prev.y, a.x, a.y, aRadius) || withinRadius(prev.x, prev.y, b.x, b.y, bRadius);
    for (let i = 1; i <= SAMPLE_STEPS; i += 1) {
      const cur = bezier(a.x, a.y, control.x, control.y, b.x, b.y, i / SAMPLE_STEPS);
      const curInNode =
        withinRadius(cur.x, cur.y, a.x, a.y, aRadius) || withinRadius(cur.x, cur.y, b.x, b.y, bRadius);
      // 양 끝이 모두 노드 몸통 밖인 구간만 히트 거리로 잰다 — 끝 노드 곁의
      // 엣지 꼬리(노드 영역)는 제외해 근접 클릭이 엣지로 새지 않게 한다.
      if (!prevInNode && !curInNode) {
        const d2 = distSqToSegment(screenX, screenY, prev.x, prev.y, cur.x, cur.y);
        if (d2 < bestD2) {
          bestD2 = d2;
          best = edge;
        }
      }
      prev = cur;
      prevInNode = curInNode;
    }
  }
  return best;
}
