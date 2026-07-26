import type { SessionAbilities } from "./session-abilities";

/**
 * 「할 일」 큐를 **일의 성격**으로 두 묶음으로 나눈다 — 사람을 나누는 게 아니다.
 *
 * 무엇을 고쳤나: 큐가 83건을 한 덩어리로 쏟아서, 코드를 안 읽는 사람에게는
 * "내가 할 수 있는 건 0건" 으로 읽혔다(2026-07-26 기획자 시선 실측). 그런데
 * 그 안에는 제품의 뜻만 알면 끝나는 일이 섞여 있었다 — 정의 한 줄, 소속 하나,
 * 같은 개념인지 판정. 데이터는 그대로 두고 **묶음과 순서만** 사람의 언어로
 * 바꾸면 "내 몫 N건 + 넘길 몫 M건" 이 된다.
 *
 * 판정 규칙 (섹션 단위 — 행 단위로 쪼개지 않는다):
 *
 * - **의미 작업** = 답이 그 개념의 *뜻* 에서 나오는 일. 정의(뜻 자체) · 소속
 *   (어디에 속하나) · 비슷한 이름(같은 것인가) · 상위 개념 후보(더 큰 개념인가).
 *   근거 수치는 화면이 이미 준다 — 판단하는 사람에게 코드 지식이 필요 없다.
 * - **코드 작업** = 그 개념 *바깥* 의 사실을 읽어야 답이 나오는 일. 오래 안
 *   바뀐 허브(구현과 대조해야 아직 맞는지 안다) · 아직 안 이어진 개념(무엇을
 *   구현 근거로 이어야 하는지) · 의존 사이클(어느 방향을 끊나).
 *
 * 왜 섹션 단위인가: 섹션 헤더는 질문("비슷한 이름 — 같은 걸까요?")이다. 같은
 * 질문을 두 묶음으로 쪼개면 헤더가 두 번 나오면서 큐가 오히려 안 읽힌다.
 * 문서가 없는 개념(사실 ③)은 묶음을 옮기는 대신 행 안에서 「문서 없음」 배지 +
 * 「문서부터 만들기」 인계로 강등된다 — 숨기지 않고 정직하게 다른 첫 걸음을 준다.
 */

export type QueueWorkGroup = "meaning" | "code";

/** 큐 카드 안의 섹션 식별자 — 각 섹션이 어느 묶음에 속하는지의 진실원. */
export type QueueSectionKey =
  | "missing-definition"
  | "missing-domain"
  | "duplicate"
  | "promotion"
  | "neglected-hub"
  | "orphan"
  | "cycle";

const GROUP_OF_SECTION: Record<QueueSectionKey, QueueWorkGroup> = {
  "missing-definition": "meaning",
  "missing-domain": "meaning",
  duplicate: "meaning",
  promotion: "meaning",
  "neglected-hub": "code",
  orphan: "code",
  cycle: "code",
};

export function groupOfQueueSection(section: QueueSectionKey): QueueWorkGroup {
  return GROUP_OF_SECTION[section];
}

/**
 * 묶음 순서. **쓰기 가능한 볼트에서는 의미 작업이 먼저** — 그 세션에서 그
 * 자리에서 끝낼 수 있는 일이 화면 위에 온다.
 *
 * 읽기 전용(샘플·권한 없음)에서는 뒤집는다: 그 세션이 실제로 완결할 수 있는
 * 유일한 행동은 인계(명령 복사)이므로, 인계로 닫히는 일을 위에 둔다. 의미
 * 작업은 사라지지 않고 아래에 남고, 헤더가 "무엇을 하면 고칠 수 있는지" 를
 * 말한다 — 막다른 길 대신 다음 문을 준다.
 */
export function queueGroupOrder(abilities: SessionAbilities): QueueWorkGroup[] {
  return abilities.canWriteVault ? ["meaning", "code"] : ["code", "meaning"];
}

/**
 * 묶음 순서가 바뀌었는지 알아보는 키. 능력이 바뀔 때만 값이 달라지므로,
 * 소비처가 이 키를 `key` 로 쓰면 렌더마다가 아니라 **능력 변화에서만**
 * 크로스페이드가 돈다(행이 이유 없이 튀지 않는다).
 */
export function queueGroupOrderKey(abilities: SessionAbilities): string {
  return queueGroupOrder(abilities).join(">");
}

export interface QueueGroupCounts {
  meaning: number;
  code: number;
}

/**
 * 묶음별 규모 — 섹션 헤더 옆에 이미 찍히는 총계(절단 전 규모)를 그대로 더한다.
 * 화면에 3행만 보여도 헤더가 말하는 수는 전체이므로, 묶음 수도 전체여야
 * "내 몫 N건" 이 목록 길이와 어긋나지 않는다.
 */
export function sumQueueGroupCounts(
  totals: ReadonlyArray<{ section: QueueSectionKey; total: number }>,
): QueueGroupCounts {
  const counts: QueueGroupCounts = { meaning: 0, code: 0 };
  for (const { section, total } of totals) {
    counts[groupOfQueueSection(section)] += Math.max(0, total);
  }
  return counts;
}
