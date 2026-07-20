/**
 * B-2 (2026-07-21 UX 라운드) — 팔레트에서 "도메인 추가" 를 누르면 새(임시)
 * 노드가 항상 고정 좌표 (240,160) 에 태어나 기존 vault 노드를 그대로 덮어,
 * 사용자가 매번 드래그로 겹침을 풀어야 했다(스크린샷: "결제" 가 "Vault —
 * Local-First" 를 가림). 디자인 게이트의 14-inch 충돌 규칙과 동류의 표면
 * 충돌이다.
 *
 * 이 순수 함수는 기존 노드 bbox 목록과 중심점을 받아, 중심에서 바깥으로
 * 링(ring)을 돌며 어느 기존 노드와도 겹치지 않는 첫 자리를 찾는다. 단순
 * 사각 나선 — 중심 → 8방위 링 → 반경 2배 링 … 순으로 확장하다 빈칸을 만나면
 * 반환. 모든 링이 막혀도(빽빽한 그래프) 마지막 후보를 반환해 최소한 중심
 * 스택보다는 흩뿌린다. 레이아웃/뷰포트 로직은 건드리지 않는다 — 좌표 계산만.
 */
export interface SpawnBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface FindFreeSpawnOptions {
  /** 이미 캔버스에 있는 노드들의 bbox (좌상단 x,y + 크기). */
  boxes: SpawnBox[];
  /** 탐색 중심 (보통 뷰포트/그래프 중심). 새 노드의 좌상단 기준점. */
  center: { x: number; y: number };
  /** 새 노드의 예상 크기 — 겹침 판정에 사용. */
  size?: { width: number; height: number };
  /** 링 간격 (px). 노드가 안 겹칠 만큼 넉넉히. */
  step?: number;
  /** 최대 링 수 — 이 링까지 다 막히면 마지막 후보 반환. */
  maxRings?: number;
  /** 겹침 여유 (px) — 이 값만큼 부풀린 bbox 로 판정해 딱 붙는 것도 피함. */
  padding?: number;
}

function overlaps(a: SpawnBox, b: SpawnBox, padding: number): boolean {
  return (
    a.x < b.x + b.width + padding &&
    a.x + a.width + padding > b.x &&
    a.y < b.y + b.height + padding &&
    a.y + a.height + padding > b.y
  );
}

export function findFreeSpawnPosition({
  boxes,
  center,
  size = { width: 196, height: 56 },
  step = 48,
  maxRings = 6,
  padding = 24,
}: FindFreeSpawnOptions): { x: number; y: number } {
  const isFree = (x: number, y: number): boolean => {
    const candidate: SpawnBox = { x, y, width: size.width, height: size.height };
    return !boxes.some((box) => overlaps(candidate, box, padding));
  };

  // 링 0 — 중심 그 자리.
  if (isFree(center.x, center.y)) return { x: center.x, y: center.y };

  // 링 1..maxRings — 각 링의 둘레를 정사각으로 훑는다. 오프셋은 step 배수.
  for (let ring = 1; ring <= maxRings; ring += 1) {
    const r = ring * step;
    // 정사각 둘레의 격자점 (모서리 + 변 중앙 포함) — 촘촘하지 않아도 충분.
    const offsets: Array<[number, number]> = [];
    for (let dx = -ring; dx <= ring; dx += 1) {
      for (let dy = -ring; dy <= ring; dy += 1) {
        // 둘레(현재 링)만 — 내부는 이전 링에서 이미 검사됨.
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
        offsets.push([dx, dy]);
      }
    }
    // 중심에서 가까운(작은 유클리드 거리) 순으로 — 위/아래 편향 없이 균형.
    offsets.sort((a, b) => a[0] * a[0] + a[1] * a[1] - (b[0] * b[0] + b[1] * b[1]));
    for (const [dxUnit, dyUnit] of offsets) {
      const x = center.x + (dxUnit / ring) * r;
      const y = center.y + (dyUnit / ring) * r;
      if (isFree(x, y)) return { x, y };
    }
  }

  // 전부 막힘 — 최소한 겹침을 줄이려 마지막 링 바깥 대각선으로 밀어낸다.
  const r = (maxRings + 1) * step;
  return { x: center.x + r, y: center.y + r };
}
