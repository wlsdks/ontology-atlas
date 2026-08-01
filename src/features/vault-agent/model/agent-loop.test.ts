// 턴 상태 기계 — 즉각성 · 중단 가능성 · 상한이 계약이다.
import { describe, expect, it, vi } from 'vitest';

import type { LlmChatEcho } from '@/shared/lib/tauri-llm';

import { runTurn, startTurn, type AgentLoopDeps } from './agent-loop';
import { anthropicAdapter } from './providers/anthropic';
import { EMPTY_SCREEN_CONTEXT } from './screen-context';
import type { ToolExecution } from './tool-executor';
import { AGENT_ROUND_CAP } from './types';

const NOTICES: AgentLoopDeps['notices'] = {
  roundCap: '여기까지 하고 정리할게요',
  aborted: '여기까지 읽었어요',
  networkFailed: '연결에 실패했어요',
  timedOut: '로컬 모델이 60초 안에 답하지 못했어요',
  rateLimited: '지금은 호출 한도예요',
  rejected: '키가 거부됐어요',
  auditBlocked: '기록을 남길 수 없어 보내지 않았어요',
  providerRefused: '이 요청은 거절됐어요',
  failed: '실패했어요',
};

type Send = AgentLoopDeps['send'];

function echo(body: unknown, status = 200): LlmChatEcho {
  return {
    status,
    body: JSON.stringify(body),
    host: 'api.anthropic.com',
    durationMs: 10,
    loggedAt: '2026-07-26T00:00:00.000Z',
  };
}

const TEXT_ONLY = {
  content: [{ type: 'text', text: '[[capabilities/payment]] 를 읽었어요.' }],
  stop_reason: 'end_turn',
};

const TOOL_CALL = {
  content: [
    {
      type: 'tool_use',
      id: 'toolu_1',
      name: 'get_concept',
      input: { slug: 'capabilities/payment' },
    },
  ],
  stop_reason: 'tool_use',
};

function okExecution(overrides: Partial<ToolExecution> = {}): ToolExecution {
  return {
    content: '{"slug":"capabilities/payment"}',
    isError: false,
    outcome: 'ok',
    target: 'capabilities/payment',
    summary: '읽음: capabilities/payment',
    readSlugs: ['capabilities/payment'],
    vaultChars: 120,
    ...overrides,
  };
}

function deps(overrides: Partial<AgentLoopDeps> = {}): AgentLoopDeps {
  return {
    adapter: anthropicAdapter,
    send: vi.fn<Send>(async () => echo(TEXT_ONLY)),
    execute: vi.fn(async () => okExecution()),
    tools: [],
    system: 'system',
    model: 'test-model',
    notices: NOTICES,
    ...overrides,
  };
}

describe('startTurn — 누른 프레임에 반응한다', () => {
  it('네트워크를 기다리지 않고 사용자 말풍선이 앉은 턴을 동기적으로 돌려준다', () => {
    const turn = startTurn({ text: '이 노드 고쳐줘', screenContext: EMPTY_SCREEN_CONTEXT });
    expect(turn.status).toBe('sending');
    expect(turn.events).toHaveLength(1);
    expect(turn.events[0]).toMatchObject({ kind: 'user', text: '이 노드 고쳐줘' });
    // 화면 문맥은 말풍선에 에코된다 — 에이전트가 본 것이 항상 화면에 남는다.
    expect(turn.events[0]).toHaveProperty('screenContext');
  });
});

describe('runTurn', () => {
  it('도구가 없으면 왕복 1회로 끝난다', async () => {
    const d = deps();
    const result = await runTurn(d, startTurn({ text: '뭐가 이상해?', screenContext: EMPTY_SCREEN_CONTEXT }), {
      signal: new AbortController().signal,
    });
    expect(result.turn.status).toBe('done');
    expect(result.turn.roundsUsed).toBe(1);
    expect(result.turn.auditCount).toBe(1);
    expect(d.send).toHaveBeenCalledTimes(1);
  });

  it('푸터 누계는 실측 글자수다 (추정치 금지)', async () => {
    const send = vi.fn<Send>(async () => echo(TEXT_ONLY));
    const d = deps({ send });
    const result = await runTurn(d, startTurn({ text: 'x', screenContext: EMPTY_SCREEN_CONTEXT }), {
      signal: new AbortController().signal,
    });
    const sentBody = send.mock.calls[0]![0].body;
    expect(result.turn.sentChars).toBe(sentBody.length);
    expect(send.mock.calls[0]![0].scope.promptChars).toBe(sentBody.length);
  });

  it('왕복 상한(6)을 넘지 않고 마무리 1회를 더한다', async () => {
    // 도구를 끝없이 부르는 모델에 대한 구조적 상한.
    const send = vi.fn<Send>(async () => echo(TOOL_CALL));
    const d = deps({ send });
    const result = await runTurn(d, startTurn({ text: 'x', screenContext: EMPTY_SCREEN_CONTEXT }), {
      signal: new AbortController().signal,
    });
    expect(result.turn.roundsUsed).toBe(AGENT_ROUND_CAP);
    // 상한 왕복 + 마무리 1회.
    expect(send).toHaveBeenCalledTimes(AGENT_ROUND_CAP + 1);
    expect(result.turn.events.at(-1)).toMatchObject({ code: 'round-cap' });
  });

  it('중단하면 그 자리에서 멈추고 정리 행을 남긴다', async () => {
    const controller = new AbortController();
    const send = vi.fn<Send>(async () => {
      controller.abort();
      return echo(TOOL_CALL);
    });
    const d = deps({ send });
    const result = await runTurn(d, startTurn({ text: 'x', screenContext: EMPTY_SCREEN_CONTEXT }), {
      signal: controller.signal,
    });
    expect(result.turn.status).toBe('aborted');
    expect(result.turn.events.at(-1)).toMatchObject({ code: 'aborted' });
    // 중단 후 새 왕복이 일어나지 않는다 — 백그라운드 계속 없음.
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('이미 끊긴 신호로 시작하면 왕복이 0회다 (패널 닫힘 = 중단)', async () => {
    const controller = new AbortController();
    controller.abort();
    const d = deps();
    const result = await runTurn(d, startTurn({ text: 'x', screenContext: EMPTY_SCREEN_CONTEXT }), {
      signal: controller.signal,
    });
    expect(d.send).not.toHaveBeenCalled();
    expect(result.turn.status).toBe('aborted');
  });

  it('도구 행은 왕복이 끝난 뒤에만 확정된다', async () => {
    // 전송 전에 "읽음" 으로 찍으면 화면이 아직 일어나지 않은 일을 말한다.
    const progress: string[] = [];
    let call = 0;
    const send = vi.fn<Send>(async () => {
      call += 1;
      return echo(call === 1 ? TOOL_CALL : TEXT_ONLY);
    });
    await runTurn(deps({ send }), startTurn({ text: 'x', screenContext: EMPTY_SCREEN_CONTEXT }), {
      signal: new AbortController().signal,
      onProgress: (turn) => {
        progress.push(turn.events.map((event) => event.kind).join(','));
      },
    });
    // 첫 진행 스냅샷에는 사용자 말풍선만 있고 도구 행이 없다.
    expect(progress[0]).toBe('user');
    expect(progress.some((line) => line.includes('toolLine'))).toBe(true);
  });

  it('전송 범위에 이 턴에 읽은 노드와 도구 이름이 실린다', async () => {
    let call = 0;
    const send = vi.fn<Send>(async () => {
      call += 1;
      return echo(call === 1 ? TOOL_CALL : TEXT_ONLY);
    });
    await runTurn(deps({ send }), startTurn({ text: 'x', screenContext: EMPTY_SCREEN_CONTEXT }), {
      signal: new AbortController().signal,
    });
    const secondScope = send.mock.calls[1]![0].scope;
    expect(secondScope.nodes).toEqual(['capabilities/payment']);
    expect(secondScope.tools).toEqual([
      { name: 'get_concept', target: 'capabilities/payment' },
    ]);
    expect(secondScope.vaultChars).toBe(120);
  });

  it('429 는 자동 재시도 없이 안내로 끝난다', async () => {
    const send = vi.fn<Send>(async () => echo({}, 429));
    const d = deps({ send });
    const result = await runTurn(d, startTurn({ text: 'x', screenContext: EMPTY_SCREEN_CONTEXT }), {
      signal: new AbortController().signal,
    });
    expect(result.turn.events.at(-1)).toMatchObject({ code: 'rate-limited' });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('감사 기록 실패는 전송 거절로 읽힌다', async () => {
    const send = vi.fn<Send>(async () => {
      throw new Error('감사 기록을 남기지 못했어요: EACCES');
    });
    const result = await runTurn(
      deps({ send }),
      startTurn({ text: 'x', screenContext: EMPTY_SCREEN_CONTEXT }),
      { signal: new AbortController().signal },
    );
    expect(result.turn.events.at(-1)).toMatchObject({ code: 'audit-blocked' });
  });

  it('생성 시간 초과를 연결 실패로 숨기지 않는다', async () => {
    const send = vi.fn<Send>(async () => {
      throw new Error('모델이 제한 시간 안에 응답하지 않았어요');
    });
    const result = await runTurn(
      deps({ send }),
      startTurn({ text: 'x', screenContext: EMPTY_SCREEN_CONTEXT }),
      { signal: new AbortController().signal },
    );
    expect(result.turn.events.at(-1)).toMatchObject({
      code: 'timed-out',
      text: NOTICES.timedOut,
    });
  });

  it('쓰기 시도는 실행되지 않고 제안 의사로만 모인다', async () => {
    let call = 0;
    const send = vi.fn<Send>(async () => {
      call += 1;
      return echo(
        call === 1
          ? {
              content: [
                {
                  type: 'tool_use',
                  id: 'toolu_w',
                  name: 'add_relation',
                  input: { from: 'a', to: 'b', type: 'depends_on' },
                },
              ],
              stop_reason: 'tool_use',
            }
          : TEXT_ONLY,
      );
    });
    const execute = vi.fn(async () =>
      okExecution({
        outcome: 'blocked-write',
        readSlugs: [],
        vaultChars: 0,
        writeIntent: { name: 'add_relation', args: { from: 'a', to: 'b' } },
        summary: '제안으로 담음 (아직 쓰지 않음)',
      }),
    );
    const result = await runTurn(
      deps({ send, execute }),
      startTurn({ text: 'x', screenContext: EMPTY_SCREEN_CONTEXT }),
      { signal: new AbortController().signal },
    );
    expect(result.writeIntents).toEqual([
      { name: 'add_relation', args: { from: 'a', to: 'b' } },
    ]);
  });

  it('인용 0 인 답은 강등 표시가 붙는다', async () => {
    const send = vi.fn<Send>(async () =>
      echo({ content: [{ type: 'text', text: '그냥 제 생각인데요' }], stop_reason: 'end_turn' }),
    );
    const result = await runTurn(
      deps({ send }),
      startTurn({ text: 'x', screenContext: EMPTY_SCREEN_CONTEXT }),
      { signal: new AbortController().signal },
    );
    const assistant = result.turn.events.find((event) => event.kind === 'assistant');
    expect(assistant).toMatchObject({ demoted: true });
  });
});
