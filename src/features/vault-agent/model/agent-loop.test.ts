// The turn state machine — immediacy, interruptibility, and the cap are the contract.
import { describe, expect, it, vi } from 'vitest';

import type { LlmChatEcho } from '@/shared/lib/tauri-llm';

import { runTurn, startTurn, type AgentLoopDeps, AUDIT_BLOCKED_PREFIX, TIMED_OUT_PREFIX } from './agent-loop';
import { anthropicAdapter } from './providers/anthropic';
import { localAdapter } from './providers/local';
import { EMPTY_SCREEN_CONTEXT } from './screen-context';
import { AGENT_TOOLS } from './tool-catalog';
import type { ToolExecution } from './tool-executor';
import { AGENT_ROUND_CAP } from './types';

const NOTICES: AgentLoopDeps['notices'] = {
  roundCap: '여기까지 하고 정리할게요',
  noToolCall: ({ round, cap }) => `${round}/${cap}번째에서 도구를 한 번도 안 부르고 멈췄어요`,
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

const OPENAI_TEXT_ONLY = {
  choices: [
    {
      message: { role: 'assistant', content: '먼저 구조를 살펴보겠습니다.' },
      finish_reason: 'stop',
    },
  ],
};

function openAiTool(name: string, args: Record<string, unknown> = {}) {
  return {
    choices: [
      {
        message: {
          role: 'assistant',
          content: '',
          tool_calls: [
            {
              id: `call_${name}`,
              type: 'function',
              function: { name, arguments: JSON.stringify(args) },
            },
          ],
        },
        finish_reason: 'tool_calls',
      },
    ],
  };
}

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

describe('startTurn responds in the pressed frame', () => {
  it('returns a turn with the user bubble synchronously without waiting for the network', () => {
    const turn = startTurn({ text: '이 노드 고쳐줘', screenContext: EMPTY_SCREEN_CONTEXT });
    expect(turn.status).toBe('sending');
    expect(turn.events).toHaveLength(1);
    expect(turn.events[0]).toMatchObject({ kind: 'user', text: '이 노드 고쳐줘' });
    // Screen context is echoed into the bubble — what the agent saw always stays on screen.
    expect(turn.events[0]).toHaveProperty('screenContext');
  });
});

describe('runTurn', () => {
  it('corrects a local model once and then fails explicitly when it skips required reads', async () => {
    const send = vi.fn<Send>(async () => echo(OPENAI_TEXT_ONLY));
    const d = deps({
      adapter: localAdapter,
      send,
      tools: AGENT_TOOLS,
      model: 'qwen3:8b',
    });

    const result = await runTurn(
      d,
      startTurn({ text: '구조를 감사해줘', screenContext: EMPTY_SCREEN_CONTEXT }),
      { signal: new AbortController().signal },
    );

    expect(send).toHaveBeenCalledTimes(2);
    const retryBody = JSON.parse(send.mock.calls[1]![0].body) as {
      messages: Array<{ role: string; content?: string }>;
    };
    expect(retryBody.messages.at(-1)).toEqual({
      role: 'user',
      content:
        'Call list_kinds now to read the ontology census. Do not answer or describe a plan.',
    });
    expect(result.turn.status).toBe('failed');
    expect(result.turn.events.some((event) => event.kind === 'assistant')).toBe(false);
    expect(result.turn.events.at(-1)).toMatchObject({
      code: 'failed',
      text: expect.stringContaining(
        'skipped or mis-scoped the required list_kinds evidence read twice',
      ),
    });
  });

  it('advances to the next evidence step when a local model does the required read after correction', async () => {
    const candidates = [
      'domains/agent-experience',
      'domains/graph-modeling',
      'domains/local-vault-management',
    ];
    const responses = [
      OPENAI_TEXT_ONLY,
      openAiTool('list_kinds'),
      openAiTool('list_concepts', { kind: 'domain', summary: true, limit: 12 }),
      openAiTool('get_concepts', { slugs: candidates, body: 'full' }),
      {
        choices: [
          {
            message: {
              role: 'assistant',
              content:
                '[[domains/agent-experience]], [[domains/graph-modeling]], [[domains/local-vault-management]]를 확인했습니다.',
            },
            finish_reason: 'stop',
          },
        ],
      },
    ];
    const send = vi.fn<Send>(async () => echo(responses.shift()));
    const execute = vi.fn(async (call) => {
      if (call.name === 'list_kinds') {
        return okExecution({
          content: '{"total":112,"byKind":{"domain":8,"capability":49,"element":54}}',
          target: call.name,
          summary: `읽음: ${call.name}`,
          readSlugs: [],
        });
      }
      if (call.name === 'list_concepts') {
        return okExecution({
          content: JSON.stringify({ rows: candidates.map((slug) => ({ slug })) }),
          target: call.name,
          summary: `읽음: ${call.name}`,
          readSlugs: [],
        });
      }
      return okExecution({
        content: JSON.stringify({
          concepts: candidates.map((slug) => ({ slug, found: true })),
        }),
        target: call.name,
        summary: `읽음: ${call.name}`,
        readSlugs: candidates,
      });
    });

    const result = await runTurn(
      deps({ adapter: localAdapter, send, execute, tools: AGENT_TOOLS, model: 'qwen3:8b' }),
      startTurn({ text: '구조를 감사해줘', screenContext: EMPTY_SCREEN_CONTEXT }),
      { signal: new AbortController().signal },
    );

    expect(result.turn.status).toBe('done');
    expect(send).toHaveBeenCalledTimes(5);
    expect(execute.mock.calls.map(([call]) => call.name)).toEqual([
      'list_kinds',
      'list_concepts',
      'get_concepts',
    ]);
  });

  it('finishes in one round trip when no tool is called', async () => {
    const d = deps();
    const result = await runTurn(d, startTurn({ text: '뭐가 이상해?', screenContext: EMPTY_SCREEN_CONTEXT }), {
      signal: new AbortController().signal,
    });
    expect(result.turn.status).toBe('done');
    expect(result.turn.roundsUsed).toBe(1);
    expect(result.turn.auditCount).toBe(1);
    expect(d.send).toHaveBeenCalledTimes(1);
  });

  it('footer totals count measured characters, not estimates', async () => {
    const send = vi.fn<Send>(async () => echo(TEXT_ONLY));
    const d = deps({ send });
    const result = await runTurn(d, startTurn({ text: 'x', screenContext: EMPTY_SCREEN_CONTEXT }), {
      signal: new AbortController().signal,
    });
    const sentBody = send.mock.calls[0]![0].body;
    expect(result.turn.sentChars).toBe(sentBody.length);
    expect(send.mock.calls[0]![0].scope.promptChars).toBe(sentBody.length);
  });

  it('stops at the six round-trip cap and adds one closing call', async () => {
    // The structural cap against a model that calls tools endlessly.
    const send = vi.fn<Send>(async () => echo(TOOL_CALL));
    const d = deps({ send });
    const result = await runTurn(d, startTurn({ text: 'x', screenContext: EMPTY_SCREEN_CONTEXT }), {
      signal: new AbortController().signal,
    });
    expect(result.turn.roundsUsed).toBe(AGENT_ROUND_CAP);
    // The capped round trips plus one wrap-up.
    expect(send).toHaveBeenCalledTimes(AGENT_ROUND_CAP + 1);
    expect(result.turn.events.at(-1)).toMatchObject({ code: 'round-cap' });
  });

  it('the closing answer after the cap still goes through provider review', async () => {
    let sendCount = 0;
    const send = vi.fn<Send>(async () => {
      sendCount += 1;
      return sendCount <= AGENT_ROUND_CAP ? echo(TOOL_CALL) : echo(TEXT_ONLY);
    });
    const adapter = {
      ...anthropicAdapter,
      reviewResponse: (
        _turn: Parameters<NonNullable<typeof localAdapter.reviewResponse>>[0],
        response: Parameters<NonNullable<typeof localAdapter.reviewResponse>>[1],
      ) =>
        response.toolCalls.length > 0
          ? ({ action: 'accept' } as const)
          : ({
              action: 'retry',
              expectedTool: 'closing-quality',
              message: 'closing answer failed review',
            } as const),
    };
    const result = await runTurn(
      deps({ send, adapter }),
      startTurn({ text: 'x', screenContext: EMPTY_SCREEN_CONTEXT }),
      { signal: new AbortController().signal },
    );
    expect(send).toHaveBeenCalledTimes(AGENT_ROUND_CAP + 1);
    expect(result.turn.status).toBe('failed');
    expect(result.turn.events.some((event) => event.kind === 'assistant')).toBe(false);
  });

  it('stops in place on abort and leaves a summary row', async () => {
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
    // No new round trip occurs after an abort — nothing continues in the background.
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('makes zero round trips when started with an already aborted signal', async () => {
    const controller = new AbortController();
    controller.abort();
    const d = deps();
    const result = await runTurn(d, startTurn({ text: 'x', screenContext: EMPTY_SCREEN_CONTEXT }), {
      signal: controller.signal,
    });
    expect(d.send).not.toHaveBeenCalled();
    expect(result.turn.status).toBe('aborted');
  });

  it('settles tool rows only after the round trip ends', async () => {
    // Marking something "read" before it is sent makes the screen state what has not happened yet.
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
    // The first progress snapshot has only the user's bubble and no tool row.
    expect(progress[0]).toBe('user');
    expect(progress.some((line) => line.includes('toolLine'))).toBe(true);
  });

  it('records the nodes read and tool names of this turn in the transfer scope', async () => {
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

  it('ends a 429 with guidance and no automatic retry', async () => {
    const send = vi.fn<Send>(async () => echo({}, 429));
    const d = deps({ send });
    const result = await runTurn(d, startTurn({ text: 'x', screenContext: EMPTY_SCREEN_CONTEXT }), {
      signal: new AbortController().signal,
    });
    expect(result.turn.events.at(-1)).toMatchObject({ code: 'rate-limited' });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('treats an audit log failure as a refused transfer', async () => {
    const send = vi.fn<Send>(async () => {
      // The shape `llm.rs` actually emits: a machine-readable code, then whatever human copy the
      // Rust side happened to compose. This test used to feed its own copy of the Korean sentence
      // and assert the code — so it passed no matter what Rust really said.
      throw new Error(`${AUDIT_BLOCKED_PREFIX}감사 기록을 남기지 못했어요: EACCES`);
    });
    const result = await runTurn(
      deps({ send }),
      startTurn({ text: 'x', screenContext: EMPTY_SCREEN_CONTEXT }),
      { signal: new AbortController().signal },
    );
    expect(result.turn.events.at(-1)).toMatchObject({ code: 'audit-blocked' });
  });

  it('does not report a generation timeout as a connection failure', async () => {
    const send = vi.fn<Send>(async () => {
      throw new Error(`${TIMED_OUT_PREFIX}모델이 제한 시간 안에 응답하지 않았어요`);
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

  it('collects write attempts as proposal intents without executing them', async () => {
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

  it('marks an answer produced without any read as unread', async () => {
    const send = vi.fn<Send>(async () =>
      echo({ content: [{ type: 'text', text: '그냥 제 생각인데요' }], stop_reason: 'end_turn' }),
    );
    const result = await runTurn(
      deps({ send }),
      startTurn({ text: 'x', screenContext: EMPTY_SCREEN_CONTEXT }),
      { signal: new AbortController().signal },
    );
    const assistant = result.turn.events.find((event) => event.kind === 'assistant');
    expect(assistant).toMatchObject({ grounding: 'unread' });
  });

  /**
   * 2026-08-02 — this branch was accepted as `status: 'done'` with no notice at all.
   * Reaching the cap raises `round-cap` while an early exit stayed silent, so the
   * screen was indistinguishable from a normal completion (the `agent ok tools=[]`
   * turns in the measured audit log).
   */
  it('leaves a notice mirroring the cap notice when a turn stops without calling any tool', async () => {
    const send = vi.fn<Send>(async () =>
      echo({ content: [{ type: 'text', text: '아마 그럴 거예요' }], stop_reason: 'end_turn' }),
    );
    const result = await runTurn(
      deps({ send }),
      startTurn({ text: 'x', screenContext: EMPTY_SCREEN_CONTEXT }),
      { signal: new AbortController().signal },
    );
    const notice = result.turn.events.find((event) => event.kind === 'notice');
    expect(notice).toMatchObject({ code: 'no-tool-call' });
    expect(notice).toMatchObject({ text: `1/${AGENT_ROUND_CAP}번째에서 도구를 한 번도 안 부르고 멈췄어요` });
  });

  it('adds no such notice when the turn finishes normally after using tools', async () => {
    // Attaching it to ① would add wallpaper to every normal turn.
    const send = vi
      .fn<Send>()
      .mockResolvedValueOnce(echo(TOOL_CALL))
      .mockResolvedValueOnce(echo(TEXT_ONLY));
    const result = await runTurn(
      deps({ send }),
      startTurn({ text: 'x', screenContext: EMPTY_SCREEN_CONTEXT }),
      { signal: new AbortController().signal },
    );
    expect(
      result.turn.events.filter(
        (event) => event.kind === 'notice' && event.code === 'no-tool-call',
      ),
    ).toHaveLength(0);
  });
});
