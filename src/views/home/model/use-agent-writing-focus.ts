'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  deriveAgentWritingActivity,
  type AgentActivityEntry,
} from '@/shared/lib/agent-activity-log';

/** 시계 눈금 — 창 만료를 이 주기로 다시 판정한다(활동 칩 피드와 같은 값). */
const TICK_MS = 30_000;

/**
 * 「지금 쓰는 중」인 에이전트의 마지막 대상 슬러그 — 지도 링(W6)의 둘째 소스.
 *
 * 링의 첫 소스는 하트비트의 `focus.ontologySlug`(에이전트가 **의도**를 선언한
 * 것)다. 그런데 하트비트를 등록하지 않고 MCP 로만 붙는 에이전트가 실제로
 * 다수다 — 그들의 쓰기는 `activity.jsonl` 에만 남는다. 이 훅은 그 로그에서
 * 「쓰는-중 창(2분, `AGENT_WRITING_WINDOW_MS`) 안의 마지막 쓰기 대상」을
 * 돌려준다. 창을 벗어나면 로그가 안 바뀌어도 스스로 null 로 꺼져야 하므로
 * 30초 눈금으로 다시 판정한다.
 *
 * 슬러그 관문(`toSlugTarget`)은 파생 함수가 이미 지난다 — 배치 표식·파일
 * 경로는 여기서도 링이 되지 않는다. 지어내기 0 은 W6 의 원 규칙 그대로다.
 */
export function useAgentWritingFocusSlug(
  log: readonly AgentActivityEntry[] | null | undefined,
): string | null {
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), TICK_MS);
    return () => window.clearInterval(timer);
  }, []);
  return useMemo(() => {
    if (!log || log.length === 0) return null;
    const activity = deriveAgentWritingActivity(log, nowMs);
    return activity.writing ? activity.lastTarget : null;
  }, [log, nowMs]);
}
