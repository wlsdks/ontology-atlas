import { useCallback, useSyncExternalStore } from 'react';

/**
 * 「적용 범위」 기억 — 한 번 고른 스코프가 다음 연결에도 남는다.
 *
 * ## 기본값이 프로젝트인 이유 (소유자 관측과 다르다)
 *
 * 소유자 관측: *"대부분 에이전트 연결할때 프로젝트별 보다는 전역으로 할텐데?"* —
 * 이 관측을 **선택지로는 전부 수용**한다(전역 스코프가 그래서 생겼다). 그런데
 * **기본값**은 뒤집지 않는다. 근거 둘:
 *
 * 1. **공식 문서 12곳 중 전역을 기본으로 미는 곳이 0곳이다**
 *    (`.qa-scratch/mcp-install-ux-survey-2026-07-30.md`). 프로젝트를 명시한 곳이
 *    1곳(Supabase `--scope project`), 나머지는 무언급이라 Claude Code 기본값
 *    `local` 에 착지한다.
 * 2. **되돌릴 수 있는 쪽이 기본이어야 한다.** 프로젝트 스코프는 볼트 안이라
 *    `git diff` 로 보이고 `git checkout` 으로 지워진다. 전역은 홈 폴더라 둘 다
 *    아니다. 첫 연결이 조용히 홈을 고치고 흔적이 안 남는 것을 기본으로 두지
 *    않는다.
 *
 * 그래서 관측은 **기본값이 아니라 기억**으로 존중한다 — 전역을 한 번 고른
 * 사용자는 다음에도 전역에서 시작한다. 매번 다시 고르게 하는 것이 그 관측을
 * 무시하는 방식이었을 것이다.
 */

export type AgentConfigScope = 'project' | 'global';

const STORAGE_KEY = 'ontology-atlas:agent-config-scope';

/** 기본값. 위 머리말 2번 — 되돌릴 수 있는 쪽. */
const FALLBACK: AgentConfigScope = 'project';

const listeners = new Set<() => void>();

function read(): AgentConfigScope {
  if (typeof window === 'undefined') return FALLBACK;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'global' ? 'global' : FALLBACK;
  } catch {
    return FALLBACK;
  }
}

/** 저장 + 같은 탭의 모든 소비처에 알림. `storage` 이벤트는 다른 탭만 오므로 직접 부른다. */
export function setAgentConfigScope(scope: AgentConfigScope): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, scope);
  } catch {
    // 저장 실패(사파리 프라이빗 등)는 이 세션 안에서만 안 기억되는 정도의 일이다.
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useAgentConfigScope(): AgentConfigScope {
  const getSnapshot = useCallback(() => read(), []);
  const getServerSnapshot = useCallback(() => FALLBACK, []);
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
