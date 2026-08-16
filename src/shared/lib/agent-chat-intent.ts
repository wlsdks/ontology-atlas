'use client';

/**
 * "이 도구로 대화를 열어라" 는 요청 — 설정 시트에서 지도 쪽 대화창으로 가는
 * 단방향 신호 하나.
 *
 * ## 왜 필요한가 (2026-08-16 검수)
 *
 * 첫 걸음 카드의 1단 이름은 **「AI 에이전트 연결」**이고, 그 버튼은 설정의
 * Agents 칸을 연다. 그런데 그 칸에 있는 것은 **목록과 바깥 링크뿐**이었다 —
 * 무엇이 잡혔는지 보여 주기만 하고, 거기서 **연결로 넘어갈 문이 없었다.**
 * 어느 도구를 쓸지는 코드가 알아서 첫 번째를 골랐고, 대화를 여는 유일한
 * 자리는 그 대화창의 머리(즉, 이미 대화를 연 사람만 보는 곳)였다.
 *
 * 그래서 그 줄에 문을 하나 낸다: **이 도구로 대화 열기.** 설정 시트는 앱
 * 셸이 소유하고 대화창은 지도가 소유하므로, 둘을 잇는 방법은 옆 파일
 * (`settings-view-intent`)이 이미 쓰는 window 이벤트 관례를 그대로 따른다 —
 * 반대 방향의 같은 길이다.
 */

const AGENT_CHAT_INTENT_EVENT = 'ontology-atlas:agent-chat-intent';

interface AgentChatIntentDetail {
  /** 어느 실행기로 열 것인가. 지정 안 하면 지금 고른 것으로 연다. */
  runtimeId: string | null;
}

export function requestAgentChat(runtimeId: string | null = null): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent<AgentChatIntentDetail>(AGENT_CHAT_INTENT_EVENT, {
      detail: { runtimeId },
    }),
  );
}

/** 요청을 받는다. 반환값은 해지 함수 — effect cleanup 에 그대로 쓴다. */
export function subscribeAgentChatIntent(
  handler: (runtimeId: string | null) => void,
): () => void {
  if (typeof window === 'undefined') return () => {};
  const listener = (event: Event) => {
    const detail = (event as CustomEvent<AgentChatIntentDetail>).detail;
    handler(detail?.runtimeId ?? null);
  };
  window.addEventListener(AGENT_CHAT_INTENT_EVENT, listener);
  return () => window.removeEventListener(AGENT_CHAT_INTENT_EVENT, listener);
}
