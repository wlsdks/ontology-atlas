/**
 * 인사이트 화면의 **단일 판정 모델** (#63).
 *
 * 왜 필요한가: 같은 볼트를 두고 한 화면이 서로 모순된 말을 했다.
 *
 * - `할 일` 탭 배지는 `do-next-queue` 만 셌다 — 방치된 허브 · 고아 · 승격 후보
 *   + 의존 순환. 통계적 신호다.
 * - `수리 큐` 는 CLI-parity 인 `vault-health` 를 셌다 — 분리된 섬 · 누락된 연결.
 *   `ontology-atlas health` 가 `needs_attention` 으로 뒤집는 바로 그 신호다.
 * - 빈 상태 문구는 do-next 만 보고 "지금은 손볼 것이 없어요 — 그래프가
 *   건강합니다" 라고 단정했다.
 *
 * 그래서 스타터 볼트처럼 신호가 '누락된 연결 1건' 뿐이면 `할 일 0` +
 * "그래프가 건강합니다" + `누락된 연결 1` 이 **동시에** 떴고, 같은 데이터에
 * MCP `health` 는 `needs_attention` 을 반환했다 (opus5 검수 2026-07-25).
 * C1(#631)이 수리 큐만 CLI 와 맞추고 할 일/건강 문구는 옛 모델에 남긴 결과다.
 *
 * 이 모듈은 두 신호군을 하나의 판정으로 합친다. 숫자를 숨겨 모순을 피하지
 * 않는다 — 둘 다 세되, **무엇이 차단(blocking)이고 무엇이 권장(advisory)인지**
 * 구분해서 "건강함" 이 실제로 0일 때만 나오게 한다.
 */

export interface InsightsSignalCounts {
  /** CLI 가 needs_attention 으로 뒤집는 신호 — 분리된 섬. */
  islands: number;
  /** CLI 가 needs_attention 으로 뒤집는 신호 — 소속 도메인 누락. */
  missingContainment: number;
  /** 의존 순환 — 구조적 결함이라 차단으로 센다. */
  cycles: number;
  /** 오래 안 만진 허브 — 통계적 권장. */
  neglectedHubs: number;
  /** 아무 데도 안 붙은 노드 — 통계적 권장. */
  orphans: number;
  /** 여러 곳에서 참조되는 노드 — 상위 개념 승격 권장. */
  promotions: number;
  /**
   * 뜻이나 소속이 안 적힌 개념 — 사람이 한 문장으로 메울 수 있는 공백.
   * 권장으로 센다: 그래프가 깨진 건 아니지만, 배지가 이걸 빼면 큐가 행을
   * 보여주는데 배지는 0 이라고 말하는 옛 모순(#63)이 다시 열린다.
   */
  meaningGaps?: number;
}

export interface InsightsVerdict {
  /**
   * 그래프를 "고쳐야 하는" 신호 수 — CLI 가 needs_attention 으로 판정하는
   * 것들. 이 값이 0 이 아니면 어떤 표면도 "건강합니다" 라고 말하면 안 된다.
   */
  blocking: number;
  /** 해두면 좋은 권장 사항 수. 차단이 아니다. */
  advisory: number;
  /** 배지에 쓰는 총합 — 사용자가 보는 "할 일" 은 둘을 합친 수다. */
  total: number;
  /**
   * `건강함` 을 주장해도 되는가. **차단·권장이 모두 0일 때만** true —
   * 권장이 남아 있는데 "건강합니다" 라고 하면, 바로 아래 수리 큐가 1건을
   * 보여주는 순간 화면이 자기모순에 빠진다.
   */
  healthy: boolean;
  /**
   * CLI(`ontology-atlas health` / MCP `health`)와 같은 판정 문자열.
   * UI 와 에이전트가 같은 단어를 쓰는지 계약 테스트로 잡을 수 있게 노출한다.
   */
  status: "healthy" | "needs_attention";
}

export function buildInsightsVerdict(counts: InsightsSignalCounts): InsightsVerdict {
  const blocking = counts.islands + counts.missingContainment + counts.cycles;
  const advisory =
    counts.neglectedHubs + counts.orphans + counts.promotions + (counts.meaningGaps ?? 0);
  return {
    blocking,
    advisory,
    total: blocking + advisory,
    healthy: blocking === 0 && advisory === 0,
    // CLI 는 섬/누락 연결/순환에서만 needs_attention 으로 뒤집는다 — 권장
    // 사항은 통계적 제안이라 판정을 바꾸지 않는다. 그래서 `status` 는 blocking
    // 만 보고, `healthy`(화면이 "건강합니다" 라고 말해도 되는가)는 둘 다 본다.
    status: blocking === 0 ? "healthy" : "needs_attention",
  };
}
