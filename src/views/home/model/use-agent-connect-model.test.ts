import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useAgentConnectModel } from './use-agent-connect-model';

/**
 * **지금 붙어 있나** — 이 모델이 답하는 유일한 질문.
 *
 * ⚠️ 2026-08-21 까지 이 파일은 연결 시트가 그리던 것들(등록 스니펫 · 도메인
 * 이름 · 「몇 분 전」)까지 쟀다. 시트가 목적지로 은퇴하면서(원장 90) 그 값들은
 * **읽는 곳이 0** 이 됐고, 검사도 같이 줄었다 — 아무도 안 읽는 값을 계속 재는
 * 검사는 초록인 채로 아무것도 안 지킨다.
 *
 * 특히 「몇 분 전」은 **시트를 열 때** 찍은 시각으로 계산했다. 시트가 없으면
 * 기준 시각이 `0` 이라 1970년부터의 시간이 나온다 — 죽은 값을 남겨 두면
 * 다음 사람이 그것을 그린다.
 */

const heartbeat = {
  agent: 'claude',
  updatedAt: new Date('2026-08-21T00:00:00Z').toISOString(),
  focus: { ontologySlug: 'agents-destination' },
};

describe('에이전트 연결 상태', () => {
  it('heartbeat 이 없거나 무효면 none', () => {
    expect(
      renderHook(() => useAgentConnectModel({ agentActivityStatus: null })).result.current.status,
    ).toEqual({ kind: 'none' });

    expect(
      renderHook(() =>
        useAgentConnectModel({
          agentActivityStatus: { heartbeat, valid: false, stale: false },
        }),
      ).result.current.status,
    ).toEqual({ kind: 'none' });
  });

  it('오래된 heartbeat 은 stale', () => {
    expect(
      renderHook(() =>
        useAgentConnectModel({
          agentActivityStatus: { heartbeat, valid: true, stale: true },
        }),
      ).result.current.status,
    ).toEqual({ kind: 'stale' });
  });

  it('살아 있으면 connected', () => {
    expect(
      renderHook(() =>
        useAgentConnectModel({
          agentActivityStatus: { heartbeat, valid: true, stale: false },
        }),
      ).result.current.status,
    ).toEqual({ kind: 'connected' });
  });
});
