/**
 * 공방 실습 — 하나를 같이 만들어 보고, 끝나면 지울 수 있게 한다.
 *
 * ## 왜 필요한가
 *
 * 공방은 이 제품에서 **쓰기가 일어나는 유일한 표면**인데, 첫 방문자에게는
 * "여기서 뭘 하면 되는지" 가 화면에 없다. 나침 무대는 방위가 고정돼 있어
 * 익히고 나면 빠르지만, 익히기 전에는 빈 소켓 네 개가 **네 개의 질문**으로
 * 보인다. 그래서 읽는 안내(투어 카드) 대신 **한 번 해 보는 안내**를 준다 —
 * 산문은 잊히고 손이 한 일은 남는다.
 *
 * ## 이 파일이 지키는 계약 두 개
 *
 * **① 단계는 지시가 아니라 관측이다.** 아래 `practiceStep` 은 카운터를 올리지
 * 않는다. 지금 초안의 **실제 상태**(이름이 있나 · 관계가 있나 · 저장됐나)를
 * 읽어 단계를 정한다. 그래서 사용자가 순서를 어겨도 안내가 따라간다 — 관계를
 * 먼저 잇고 이름을 나중에 지어도 "이름부터 지으세요" 라고 우기지 않는다.
 * 스크립트가 상태를 앞지르면 그 순간 안내는 거짓말이 되고, 거짓말하는 안내는
 * 없는 안내보다 나쁘다.
 *
 * **② 실습이 남긴 것은 실습이 치운다.** 실습으로 만든 노드는 **진짜 파일**로
 * 디스크에 앉는다(가짜 저장을 만들면 그건 실습이 아니라 시늉이고, 시늉은
 * 아무것도 안 가르친다). 대신 끝나면 지울지 물어보고, 그 삭제도 진짜 삭제다.
 * 남기기를 고르면 그대로 볼트의 일부가 된다 — 연습이 곧 첫 노드가 된다.
 */

/** 실습이 관측하는 네 국면. `done` 은 디스크에 앉은 뒤다. */
export type PracticeStep = "name" | "relate" | "save" | "done";

export interface PracticeObservation {
  /** 초안의 이름 — 공백만 있는 것은 없는 것으로 본다. */
  title: string;
  /** 지금 초안에 달린 관계 수(방위 무관). */
  relationCount: number;
  /** 쓰기가 이미 끝났나. */
  saved: boolean;
}

/**
 * 지금 무엇을 할 차례인지 **상태에서 읽는다**.
 *
 * 순서가 아니라 우선순위다 — 이름이 없으면 이름이 먼저인 이유는 그것이 1번
 * 단계라서가 아니라, 이름 없는 노드는 저장할 수 없기 때문이다.
 */
export function practiceStep({
  title,
  relationCount,
  saved,
}: PracticeObservation): PracticeStep {
  if (saved) return "done";
  if (title.trim() === "") return "name";
  if (relationCount === 0) return "relate";
  return "save";
}

/** 진행 표시용 — `done` 포함 네 칸 중 몇 번째인가(1-base). */
export const PRACTICE_STEP_ORDER: readonly PracticeStep[] = [
  "name",
  "relate",
  "save",
  "done",
] as const;

export function practiceStepIndex(step: PracticeStep): number {
  return PRACTICE_STEP_ORDER.indexOf(step) + 1;
}

/**
 * 실습으로 만든 노드의 **되돌리기 표**.
 *
 * 삭제 제안이 정직하려면 "무엇을 지우는지" 가 정확해야 한다. 공방의 생성
 * 경로는 새 노드 문서 하나만 만드는 게 아니라, 출발 노드(A)의 frontmatter 에
 * A→새 노드 관계를 적기도 하고, A 에게 문서가 없으면 **A 까지 실체화**한다.
 * 그래서 "방금 만든 것" 이 최대 두 파일이 될 수 있다.
 *
 * 이 표를 안 만들고 새 노드만 지우면 **A 에 남은 참조가 깨진 링크로 살아남는다**
 * — 실습이 볼트를 더럽히고 끝나는 셈이라 실습의 약속을 정면으로 깬다.
 */
export interface PracticeArtifact {
  /** 실습이 만든 노드 문서의 slug. */
  slug: string;
  /** 화면에 보여 줄 이름. */
  title: string;
  /**
   * 실습이 **함께 실체화한** 출발 노드의 slug — 원래 없던 문서를 이 실습이
   * 만들었을 때만 채운다. 이미 있던 문서면 null 이고, 그때는 지우면 안 된다
   * (사용자의 기존 자산이다).
   */
  createdOriginSlug: string | null;
  /**
   * 이미 있던 출발 노드에 **덧붙인** 관계 — 되돌리려면 이 참조만 빼야 한다.
   * 문서 자체는 남는다.
   */
  touchedOrigin: { slug: string; frontmatterKey: string; ref: string } | null;
}

/**
 * 실습 정리에서 실제로 무엇을 할지 계산한다. UI 가 문장을 짓기 전에 이걸
 * 먼저 물어야 "문서 1개를 지웁니다" 와 "문서 2개를 지우고 참조 1개를 뺍니다"
 * 를 구별해서 말할 수 있다.
 */
export interface PracticeCleanupPlan {
  deleteSlugs: string[];
  /** 참조만 빼는 대상 — 문서는 보존한다. */
  detach: { slug: string; frontmatterKey: string; ref: string } | null;
}

export function planPracticeCleanup(artifact: PracticeArtifact): PracticeCleanupPlan {
  const deleteSlugs = [artifact.slug];
  if (artifact.createdOriginSlug) deleteSlugs.push(artifact.createdOriginSlug);
  return {
    deleteSlugs,
    // 우리가 만든 문서를 통째로 지우는 경우엔 그 안의 참조도 같이 사라지므로
    // 따로 뗄 것이 없다. 남는 문서에 붙인 참조만 뗀다.
    detach:
      artifact.touchedOrigin && artifact.touchedOrigin.slug !== artifact.createdOriginSlug
        ? artifact.touchedOrigin
        : null,
  };
}
