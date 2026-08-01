/**
 * 경로 칩이 **무엇을 말해야 하는가** — 순수 판정.
 *
 * ## 화면이 하던 거짓말 (2026-08-01 수리)
 *
 * 끝점의 제목은 `resolveTopologyNodeTitle` 이 냈고, 그 함수는 못 찾으면
 * **슬러그를 그대로 제목으로** 돌려줬다. 그래서 이 볼트에 없는 노드 둘을
 * 놓고도 칩은 이름 두 개를 멀쩡히 그린 뒤 「경로 없음」이라고 **단언**했다.
 * 진실은 *"둘 다 여기 없다"* 인데 화면은 *"둘 다 있고 안 이어져 있다"* 고
 * 말한 것이다 — 이건 침묵보다 나쁘다. 사용자는 존재하지 않는 관계에 대해
 * 판단을 내리게 된다.
 *
 * 게다가 그 상태에서 **「경로 패킷 복사」** 버튼이 그대로 떠 있었다. 그
 * 패킷은 존재하지 않는 슬러그 둘과 「경로 없음」이라는 결론을 에이전트에게
 * 넘긴다 — 사람이 속은 것을 기계에게 사실로 전달하는 자리다.
 *
 * ## 규칙
 *
 * 끝점 중 하나라도 이 볼트에서 해석되지 않으면 **그 사실만 말한다.** 홉 수도,
 * 「경로 없음」도, 복사 버튼도 없다 — 셋 다 "두 노드가 실재한다" 를 전제로
 * 하는 주장이라서다.
 */
export type TopologyPathChipState =
  /** 소스만 골랐다 — 대상을 기다리는 정상 상태. */
  | { kind: "awaiting-target"; sourceTitle: string }
  /** 끝점이 이 볼트에 없다. `missing` 은 주소가 실어 온 원본 슬러그. */
  | { kind: "missing-endpoints"; missing: readonly string[] }
  /** 둘 다 실재하는데 잇는 길이 없다 — 참인 「경로 없음」. */
  | { kind: "no-path"; sourceTitle: string; targetTitle: string }
  | { kind: "resolved"; sourceTitle: string; targetTitle: string; hops: number };

export interface TopologyPathChipInput {
  sourceSlug: string | null;
  targetSlug: string | null;
  /** 해석된 제목. 해석 실패면 null — **슬러그를 대신 넣지 말 것.** */
  sourceTitle: string | null;
  targetTitle: string | null;
  hopCount: number | null;
}

export function resolveTopologyPathChipState({
  sourceSlug,
  targetSlug,
  sourceTitle,
  targetTitle,
  hopCount,
}: TopologyPathChipInput): TopologyPathChipState | null {
  if (!sourceSlug) return null;

  const missing: string[] = [];
  if (!sourceTitle) missing.push(sourceSlug);
  if (targetSlug && !targetTitle) missing.push(targetSlug);
  if (missing.length > 0) return { kind: "missing-endpoints", missing };

  // 위 분기를 지났으면 sourceTitle 은 반드시 있다.
  const resolvedSourceTitle = sourceTitle as string;
  if (!targetSlug || !targetTitle) {
    return { kind: "awaiting-target", sourceTitle: resolvedSourceTitle };
  }
  if (hopCount === null) {
    return { kind: "no-path", sourceTitle: resolvedSourceTitle, targetTitle };
  }
  return {
    kind: "resolved",
    sourceTitle: resolvedSourceTitle,
    targetTitle,
    hops: hopCount,
  };
}

/**
 * 에이전트에게 넘겨도 되는 상태인가 — **두 끝점이 실재할 때만.** 「경로 없음」
 * 도 넘길 수 있다: 그건 두 노드가 있다는 전제 위의 참인 사실이다.
 */
export function canCopyTopologyPathPacket(
  state: TopologyPathChipState | null,
): boolean {
  return state?.kind === "resolved" || state?.kind === "no-path";
}
