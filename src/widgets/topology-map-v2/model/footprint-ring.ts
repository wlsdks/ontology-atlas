/**
 * 발자국 트레일 링 — 세션 동안 ego 포커스가 됐던 노드에 얹는 옅은 pale 인디고
 * 헤어라인 링(정적 표기, 애니메이션 없음). 색은 `--topology-v2-edge-selected`
 * 계열(pale 인디고 rgba(200,210,255))을 그대로 재사용한다 — 새 hue/glow 금지.
 *
 * 소유자 설계("기억이 바래는 은유"): 링을 균일하게 두지 않고 **최근성으로 감쇠**
 * 시킨다. 가장 최근 방문이 가장 두껍고 진하며(rank 0), 오래된 방문일수록 얇고
 * 옅어진다. 정적이지만 "내가 걸어온 순서"가 색·굵기로 읽혀 장식이 아니라 정보가
 * 된다. 위계는 언제나 선택 링(실선 인디고 2px) · 확장 오라(파선 0.55) · 결계보다
 * **낮게** 유지된다 — 발자국이 소음이 되지 않게 감쇠 상단을 그 아래로 잡는다.
 *
 * WebGL 저알파 결함 이력(저알파→불투명 합성) 대비: 이 링은 canvas 2D 경로라
 * 무관하지만, 안전하게 감쇠 하한(rank 3+)을 두고 어떤 단도 유효 알파가 매우
 * 낮아지지(<0.12) 않게 한다.
 */

export interface FootprintRingStyle {
  /** 이 링의 기본 알파(그리는 쪽이 노드 티어/dim 알파와 곱한다). */
  alpha: number;
  /** 헤어라인 두께(px). 선택 링(2px)보다 항상 얇다. */
  lineWidth: number;
}

/**
 * 최근성 rank(0 = 가장 최근) → 링 스타일. 3단 사다리 + 하한. 상단(rank 0)의
 * 알파 0.5·굵기 1.5px 는 확장 오라(0.55)·선택 링(2px·알파1)보다 낮아 위계
 * 간섭이 없다. 하한 0.2 는 유효 알파(티어·edgeSelected 자체 알파 곱 이전 기준)를
 * 0.12 위로 유지한다.
 */
const FOOTPRINT_RING_LADDER: readonly FootprintRingStyle[] = [
  { alpha: 0.5, lineWidth: 1.5 }, // rank 0 — 가장 최근 방문
  { alpha: 0.38, lineWidth: 1.25 }, // rank 1
  { alpha: 0.28, lineWidth: 1 }, // rank 2
];
/** rank 3 이상(오래된 방문)의 감쇠 하한 — 더 옅어지지 않고 여기서 멈춘다. */
const FOOTPRINT_RING_FLOOR: FootprintRingStyle = { alpha: 0.2, lineWidth: 1 };

/** 발자국 링이 노드 디스크 바깥으로 나가는 오프셋(px, 스크린) — 선택 링(+6)·확장
 *  오라(+6)보다 안쪽(+3)에 붙어 시각 무게를 낮춘다. */
export const FOOTPRINT_RING_OFFSET = 3;

export function footprintRingStyle(recencyRank: number): FootprintRingStyle {
  if (recencyRank < 0) return FOOTPRINT_RING_FLOOR;
  return FOOTPRINT_RING_LADDER[recencyRank] ?? FOOTPRINT_RING_FLOOR;
}

/** 감쇠 사다리 최상단(rank 0)의 알파 — 위계 검증(발자국 < 확장 오라 0.55)용 공개 상수. */
export const FOOTPRINT_RING_MAX_ALPHA = FOOTPRINT_RING_LADDER[0].alpha;
/** 감쇠 사다리 최상단(rank 0)의 굵기 — 위계 검증(발자국 < 선택 링 2px)용 공개 상수. */
export const FOOTPRINT_RING_MAX_LINE_WIDTH = FOOTPRINT_RING_LADDER[0].lineWidth;

/**
 * 방문 순서 배열(오래된 → 최근)에서 노드별 최근성 rank 를 만든다. rank 0 = 가장
 * 최근. `excludeId`(현재 포커스 노드)는 이미 선택 링이 그 자리를 가지므로 발자국
 * 링에서 제외한다 — 이중 링 방지 + 위계(선택 > 발자국) 보존.
 */
export function buildFootprintRanks(
  trail: readonly string[],
  excludeId: string | null,
): Map<string, number> {
  const ranks = new Map<string, number>();
  let rank = 0;
  // 최근 방문이 배열의 끝에 있으므로 뒤에서부터 rank 를 매긴다.
  for (let i = trail.length - 1; i >= 0; i -= 1) {
    const id = trail[i];
    if (id === excludeId) continue;
    if (ranks.has(id)) continue; // 방어적 dedup(정상 trail 은 유니크)
    ranks.set(id, rank);
    rank += 1;
  }
  return ranks;
}
