/**
 * 방향키로 **그래프 위를 걷는다** — 갈래 B (2026-08-09 소유자 확정).
 *
 * 방향키가 카메라를 움직이는 게 아니라 **초점을 이웃으로 옮긴다.** 카메라는
 * 초점이 화면 밖으로 나가려 할 때만 따라온다. 이 파일은 그 「어느 이웃인가」를
 * 정하는 순수 함수만 갖는다 — 캔버스도 React 도 모른다.
 *
 * ## 왜 각도가 아니라 「투영 + 직교 벌점」인가
 *
 * 「위쪽 이웃」이 무엇인지는 자명하지 않다. 노드가 원형으로 둘러싸고 있으면 사람이
 * 「위」라고 부르는 것과 각도가 가장 작은 것이 다를 수 있다.
 *
 * 그래서 TV 리모컨·CSS 공간 내비게이션이 쓰는 방식을 그대로 쓴다:
 *
 * 1. 누른 방향으로의 **투영**(얼마나 그 방향으로 갔나)이 0 이하면 **뒤**라서 버린다.
 * 2. 남은 것 중에서 **투영 + 직교 거리 × 벌점**이 가장 작은 것을 고른다.
 *
 * 직교 벌점이 있어야 「거의 옆에 있는데 살짝 위」인 노드가 「바로 위」를 이기지
 * 못한다. 벌점 없이 거리만 쓰면 방향키가 방향과 무관하게 느껴진다.
 *
 * ## 부채꼴을 왜 두나 — 그리고 왜 ±60°인가
 *
 * 투영만으로 거르면 **거의 직각으로 옆에 있는 노드도 「위」로 잡힌다**(투영이
 * 아주 조금이라도 양수면 통과). 그러면 위를 눌렀는데 옆으로 가고, 사용자는
 * 방향키를 못 믿는다.
 *
 * ±45° 로 좁히면 그래프에서 도달 못 하는 이웃이 많아진다 — 노드가 격자에 놓인
 * 게 아니라 물리로 퍼져 있어서다. ±60° 는 네 방향이 **틈 없이 평면을 덮는**
 * 가장 좁은 각이다(4 × 120° = 360°). 그보다 좁히면 어느 방향키로도 못 닿는
 * 이웃이 생기고, 넓히면 두 방향이 같은 이웃을 다툰다.
 *
 * ⚠️ **없으면 아무 일도 안 한다 — 감싸 돌지 않는다.** 그 방향에 이웃이 없을 때
 * 반대편으로 뛰면, 사용자는 자기가 어디 있는지 잃는다. 「아무 일도 안 일어남」은
 * 이 경우 정직한 응답이다.
 */

export type WalkDirection = 'up' | 'down' | 'left' | 'right';

export interface WalkNode {
  readonly id: string;
  readonly x: number;
  /** 화면 좌표계 — **아래로 갈수록 커진다**(캔버스 기준). `up` 은 y 가 줄는 쪽. */
  readonly y: number;
}

/** 직교 거리에 매기는 벌점. 1 이면 45°에서 정면과 같은 값이 된다. */
export const ORTHOGONAL_PENALTY = 2;

/**
 * 부채꼴 절반 각의 탄젠트 — ±60° (`Math.tan(Math.PI / 3)`).
 *
 * 값을 상수로 굳혀 두는 이유: 각도를 매 호출 계산하면 이 함수가 프레임마다
 * 도는 자리에 들어갈 때 그 비용이 붙는다. 그리고 이 값이 규격이므로 한 곳에서만
 * 정해져야 한다.
 */
export const CONE_HALF_TANGENT = Math.tan(Math.PI / 3);

const AXIS: Record<WalkDirection, { readonly dx: number; readonly dy: number }> = {
  up: { dx: 0, dy: -1 },
  down: { dx: 0, dy: 1 },
  left: { dx: -1, dy: 0 },
  right: { dx: 1, dy: 0 },
};

/**
 * 그 방향에 있는 이웃 중 가장 「자연스러운」 것. 없으면 `null`.
 *
 * `neighbors` 에 `from` 자신이 섞여 있어도 된다 — 투영이 0 이라 걸러진다.
 */
export function pickNeighborInDirection(
  from: WalkNode,
  neighbors: readonly WalkNode[],
  direction: WalkDirection,
): string | null {
  const axis = AXIS[direction];
  let bestId: string | null = null;
  let bestCost = Number.POSITIVE_INFINITY;

  for (const node of neighbors) {
    if (node.id === from.id) continue;
    const dx = node.x - from.x;
    const dy = node.y - from.y;

    // 누른 방향으로 얼마나 갔나 / 그 방향과 직각으로 얼마나 벗어났나.
    const along = dx * axis.dx + dy * axis.dy;
    if (along <= 0) continue; // 뒤 또는 정확히 옆
    const across = Math.abs(dx * axis.dy - dy * axis.dx);
    if (across > along * CONE_HALF_TANGENT) continue; // 부채꼴 밖

    const cost = along + across * ORTHOGONAL_PENALTY;
    // 같은 값이면 **id 가 앞선 것**을 고른다 — 같은 입력이 늘 같은 결과를 내야
    // 하고, 배열 순서에 기대면 레이아웃이 흔들릴 때 결과도 흔들린다.
    if (cost < bestCost || (cost === bestCost && bestId !== null && node.id < bestId)) {
      bestCost = cost;
      bestId = node.id;
    }
  }

  return bestId;
}

/**
 * 초점이 없을 때 처음 잡을 노드 — **화면 가운데에 가장 가까운 것**.
 *
 * 「첫 노드」를 배열 순서로 고르면 화면 밖일 수 있고, 그러면 방향키를 눌렀는데
 * 아무 변화가 안 보인다(카메라가 따라가긴 하지만 사용자는 무엇이 일어났는지
 * 모른다). 지금 보고 있는 것에서 시작하는 편이 늘 옳다.
 */
export function pickInitialFocus(
  nodes: readonly WalkNode[],
  viewportCenter: { readonly x: number; readonly y: number },
): string | null {
  let bestId: string | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const node of nodes) {
    const dx = node.x - viewportCenter.x;
    const dy = node.y - viewportCenter.y;
    const distance = dx * dx + dy * dy;
    if (distance < bestDistance || (distance === bestDistance && bestId !== null && node.id < bestId)) {
      bestDistance = distance;
      bestId = node.id;
    }
  }
  return bestId;
}

/**
 * 막다른 길을 **몇 번이나 말할 것인가** — 같은 안내를 연달아 쏟지 않게.
 *
 * ⚠️ 처음에는 그 방향에 이웃이 없으면 **아무 일도 안 했다**. 「감싸 돌지 않는다」는
 * 판단은 맞았지만(반대편으로 뛰면 사용자가 자기 위치를 잃는다), **침묵이 문제였다**:
 * 소유자가 실제로 써 보고 *"방향키가 되긴 하는데 노드를 자유롭게 이동하진 못하네?"*
 * 라고 말했다. 눌렀는데 아무 반응이 없으면 사용자는 「고장」과 「그 방향에는 없음」을
 * 구별할 수 없다 — 이 저장소가 이름 붙여 둔 **「조용한 기다림」** 과 같은 실패다.
 *
 * 그래서 제약은 그대로 두고 **말해 준다.** 다만 방향키를 누르고 있으면 같은 안내가
 * 수십 번 쌓이므로, 한 번 말한 뒤 잠시는 다시 말하지 않는다.
 *
 * 시간으로 재는 이유: 「같은 방향 연타」로만 막으면 좌우를 번갈아 누를 때 두 배로
 * 쏟아진다. 「무엇을 눌렀나」가 아니라 **「방금 말했나」** 가 기준이다.
 */
export const DEAD_END_NOTICE_COOLDOWN_MS = 1200;

/** 지금 막다른 길을 말해도 되나. `lastAtMs` 가 `null` 이면 아직 한 번도 안 말했다. */
export function shouldAnnounceDeadEnd(lastAtMs: number | null, nowMs: number): boolean {
  if (lastAtMs === null) return true;
  return nowMs - lastAtMs >= DEAD_END_NOTICE_COOLDOWN_MS;
}

/** 방향키 이름 → 우리 방향. 그 밖의 키는 `null`(우리 것이 아니다). */
export function walkDirectionForKey(key: string): WalkDirection | null {
  switch (key) {
    case 'ArrowUp':
      return 'up';
    case 'ArrowDown':
      return 'down';
    case 'ArrowLeft':
      return 'left';
    case 'ArrowRight':
      return 'right';
    default:
      return null;
  }
}
