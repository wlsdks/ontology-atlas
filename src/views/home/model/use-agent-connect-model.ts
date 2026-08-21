"use client";

import { useMemo } from "react";

/**
 * **에이전트가 지금 붙어 있나** — heartbeat 한 줄을 상태로 읽는다.
 *
 * ⚠️ 이 파일은 2026-08-21 까지 「AI 에이전트 연결」 **시트의 데이터 조립**이었다
 * (heartbeat → 상태, vault handle → 등록 스니펫, insight → 도메인 이름). 시트가
 * 목적지로 은퇴하면서(원장 90) 스니펫과 도메인 이름은 소비처가 0이 됐고, 남은
 * 것은 상태 하나다. 등록 설정은 이제 목적지의 `VaultAgentSetupPanel` 이 만든다.
 *
 * 옛 주석 (참고):
 * heartbeat → 연결 상태, vault handle → 등록 스니펫, insight → 도메인
 * 미리보기. "N분 전" 기준 시각은 시트가 열린 순간의 스냅샷
 * (렌더 중 Date.now 금지 — 저장소 purity 관례).
 */

interface AgentHeartbeatStatus {
  valid?: boolean;
  stale?: boolean;
  heartbeat?: {
    updatedAt: string;
    agent?: string | null;
    focus: { ontologySlug: string | null };
  } | null;
}

/**
 * 에이전트 연결 상태 — **레일 타일과 「Updated with AI」 분기가 읽는다.**
 *
 * ⚠️ 이 타입은 2026-08-21 까지 `widgets/agent-connect` 가 소유했다. 그 위젯이
 * 은퇴하면서(원장 90 · 붙이는 일이 목적지가 됐다) **상태만 남아** 여기로 왔다 —
 * 시트는 사라졌지만 「지금 붙어 있나」라는 질문은 그대로 있다.
 */
export type AgentConnectState =
  | { kind: "connected" }
  | { kind: "stale" }
  | { kind: "none" };

/**
 * ⚠️ **인자 넷이 2026-08-21 에 사라졌다** (원장 90): `vaultHandle` ·
 * `insightNodes` · `defaultAgentLabel` · `serverAvailability`. 넷 다 시트가
 * 그리던 것(등록 스니펫 · 도메인 이름 · 에이전트 표시 이름)의 재료였고, 시트가
 * 은퇴하며 읽는 곳이 0이 됐다.
 *
 * 「지금 붙어 있나」에 답하는 데 필요한 것은 heartbeat 하나다. **안 쓰는 인자를
 * 받는 함수는 부르는 쪽에 없는 의무를 지운다** — 그 넷을 넘기려고 HomePage 가
 * 계속 계산하고 있었다.
 */
export interface UseAgentConnectModelArgs {
  agentActivityStatus: AgentHeartbeatStatus | null;
}

/**
 * ⚠️ **시트가 은퇴하며 이 모델도 줄었다** (2026-08-21, 원장 90).
 *
 * 종전에는 여는 상태(`open`/`openSheet`/`closeSheet`)와 설정 스니펫
 * (`snippets`)·도메인 이름(`domainTitles`)까지 들고 있었다 — 전부 시트가
 * 쓰던 것이다. 시트가 사라지자 **소비처가 0** 이 됐고, 그 자리는 이제 목적지의
 * `VaultAgentSetupPanel` 이 자기 것으로 만든다.
 *
 * 남는 질문은 하나다: **지금 붙어 있나.** 레일 타일과 「Updated with AI」 분기가
 * 그것을 읽는다.
 */
export interface AgentConnectModel {
  status: AgentConnectState;
}

export function useAgentConnectModel({
  agentActivityStatus,
}: UseAgentConnectModelArgs): AgentConnectModel {

  /*
   * ⚠️ **`agoLabel`·`agentLabel`·`focusTitle` 은 2026-08-21 에 사라졌다**
   * (원장 90). 그 셋을 읽던 곳은 연결 시트 하나였고, 시트가 은퇴하면서 **읽는
   * 곳이 0** 이 됐다(실측: 소비처 전수 검색 0건).
   *
   * 특히 `agoLabel` 은 시트를 **열 때** 찍은 `nowMs` 로 계산했다 — 열지 않으면
   * 기준 시각이 `0` 이라 그 값은 화면 밖에서는 뜻이 없었다. 죽은 값을 남겨
   * 두면 다음 사람이 그것을 읽고 「몇 분 전」을 그리게 되고, 그때 나오는
   * 숫자는 1970년부터의 시간이다.
   *
   * 남는 질문은 하나다: **지금 붙어 있나.**
   */
  const status = useMemo<AgentConnectState>(() => {
    const hb = agentActivityStatus?.heartbeat ?? null;
    if (!hb || !agentActivityStatus?.valid) return { kind: "none" };
    if (agentActivityStatus.stale) return { kind: "stale" };
    return { kind: "connected" };
  }, [agentActivityStatus]);

  return { status };
}
