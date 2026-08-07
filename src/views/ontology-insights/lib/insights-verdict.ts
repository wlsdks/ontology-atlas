/**
 * 인사이트 화면의 **단일 판정 모델** (#63).
 *
 * 왜 필요한가: 같은 볼트를 두고 한 화면이 서로 모순된 말을 했다.
 *
 * - `할 일` 탭 배지는 `do-next-queue` 만 셌다 — 방치된 허브 · 고아 · 승격 후보
 *   + 의존 순환. 통계적 신호다.
 * - `수리 큐` 는 CLI-parity 인 `vault-health` 를 셌다 — 분리된 섬 · 누락된 연결.
 *   `node $ATLAS/cli/src/index.mjs health` 가 `needs_attention` 으로 뒤집는 바로 그 신호다.
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
 *
 * ## ⚠️ 왜 큐 섹션을 낱개 필드가 아니라 `Record<QueueSectionKey, number>` 로 받나
 *
 * **같은 병이 두 번 더 났기 때문이다.** 이 판정과 묶음 배지(`sumQueueGroupCounts`)
 * 가 각자 **손으로 관리하는 목록**을 갖고 있었고, 섹션이 늘 때마다 한쪽만 늘었다:
 *
 * - `meaningGaps` — 나중에 끼워 넣었다(위 필드 주석이 그 사연이다).
 * - `duplicate` — **끝내 안 들어왔다.** 2026-08-07 실측: 샘플 볼트에서 탭 배지
 *   「할 일 **7**」 바로 아래 묶음 머리가 「**8**」이었다. 차이는 중복 쌍 1건이고,
 *   한 화면이 같은 일을 두 수로 세고 있었다.
 *
 * 값을 더하는 것으로는 세 번째가 막히지 않는다. 그래서 **섹션 총계를 통째로**
 * 받는다 — `QueueSectionKey` 에 항목을 더하면 이 `Record` 가 불완전해져
 * **타입 검사에서 막히고**, 그 자리에서 「이건 차단인가 권장인가」를 정하게 된다.
 * 목록이 하나면 어긋날 곳이 없다.
 */

import type { QueueSectionKey } from "./queue-work-groups";

export interface InsightsSignalCounts {
  /** CLI 가 needs_attention 으로 뒤집는 신호 — 분리된 섬. */
  islands: number;
  /** CLI 가 needs_attention 으로 뒤집는 신호 — 소속 도메인 누락. */
  missingContainment: number;
  /**
   * 「할 일」 큐 섹션별 총계(절단 전 규모) — **전부** 있어야 한다.
   *
   * 묶음 배지(`sumQueueGroupCounts`)가 받는 것과 **같은 수**다. 두 소비처가
   * 같은 입력을 나눠 쓰므로 한 화면이 같은 일을 두 수로 셀 수 없다.
   */
  sections: Record<QueueSectionKey, number>;
}

/**
 * 섹션이 차단인가 권장인가.
 *
 * - **차단** — 그래프가 구조적으로 깨진 것. 의존 순환이 유일하다(어느 방향을
 *   끊을지 정해야 하고, 안 정하면 다른 판단이 전부 흔들린다).
 * - **권장** — 통계적 제안이거나 사람이 한 문장으로 메울 공백. 뜻·소속·중복·
 *   승격 후보·방치된 허브·고아.
 *
 * 섹션을 더하면 이 표가 불완전해져 타입 검사가 막는다 — 그 자리가 분류를
 * 강제하는 지점이다.
 */
const SECTION_SEVERITY: Record<QueueSectionKey, "blocking" | "advisory"> = {
  "missing-definition": "advisory",
  "missing-domain": "advisory",
  duplicate: "advisory",
  promotion: "advisory",
  "neglected-hub": "advisory",
  orphan: "advisory",
  cycle: "blocking",
};

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
   * CLI(`node $ATLAS/cli/src/index.mjs health` / MCP `health`)와 같은 판정 문자열.
   * UI 와 에이전트가 같은 단어를 쓰는지 계약 테스트로 잡을 수 있게 노출한다.
   */
  status: "healthy" | "needs_attention";
}

export function buildInsightsVerdict(counts: InsightsSignalCounts): InsightsVerdict {
  let sectionBlocking = 0;
  let advisory = 0;
  for (const key of Object.keys(SECTION_SEVERITY) as QueueSectionKey[]) {
    const total = Math.max(0, counts.sections[key] ?? 0);
    if (SECTION_SEVERITY[key] === "blocking") sectionBlocking += total;
    else advisory += total;
  }
  const blocking = counts.islands + counts.missingContainment + sectionBlocking;
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
