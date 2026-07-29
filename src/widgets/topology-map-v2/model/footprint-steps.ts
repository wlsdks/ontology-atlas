/**
 * 발자국 순번 — 방문 배열에서 노드별 걸음 번호를 만든다.
 *
 * 구 `footprint-ring.ts`(동심 헤어라인 링 + 최근성 rank)를 대체한다. 링을 버린
 * 이유는 `render/footprint-glyph.ts` 헤더에 있고, **rank 를 버린 이유**는 여기다:
 * rank 는 "몇 번째로 최근인가"라 노드당 하나뿐이라서, 되돌아온 걸음을 표현할
 * 자리가 없었다. step 은 "경로에서 몇 번째 걸음인가"라 재방문이 자연히 여럿이 된다.
 *
 * 순수 함수만 — 캔버스/React 지식 없음.
 */

/**
 * 노드별 **방문 순번 목록** — `["a","b","a"]` → `{a:[1,3], b:[2]}`. 1부터 센다
 * (화면에 보이는 수라 0-based 는 오독을 만든다).
 *
 * 순번은 트레일 배열 안의 위치이므로, 상한에 걸려 앞이 잘리면 남은 걸음이 1 부터
 * 다시 매겨진다 — "지금 보이는 길에서 몇 번째"가 사용자가 답할 수 있는 유일한
 * 질문이다(잘려 나간 걸음의 번호를 유지하면 1 이 없는 목록이 된다).
 */
export function buildFootprintSteps(trail: readonly string[]): Map<string, number[]> {
  const steps = new Map<string, number[]>();
  trail.forEach((id, i) => {
    const list = steps.get(id);
    if (list) list.push(i + 1);
    else steps.set(id, [i + 1]);
  });
  return steps;
}

/** 엣지 양끝 id → 조회 키. 방향 무관하게 정렬한다(엣지는 무향으로 조회된다). */
export function walkedEdgeKey(a: string, b: string): string {
  return a < b ? `${a} ${b}` : `${b} ${a}`;
}

/**
 * 트레일에서 **연달아 방문한 쌍**의 키 집합 — 선 옆 자국을 어느 관계선에 찍을지
 * 정한다.
 *
 * 연속 방문한 두 노드 사이에 **실제 관계가 없을 수도 있다**. 그래서 이 집합은
 * "후보"이고, 그리는 쪽이 실재하는 엣지에만 얹는다 — 없는 선을 따라 자국을
 * 찍으면 "선 = 관계"라는 계약이 깨진다.
 */
export function buildWalkedEdgeKeys(trail: readonly string[]): Set<string> {
  const keys = new Set<string>();
  for (let i = 1; i < trail.length; i += 1) {
    const a = trail[i - 1];
    const b = trail[i];
    if (a === b) continue;
    keys.add(walkedEdgeKey(a, b));
  }
  return keys;
}
