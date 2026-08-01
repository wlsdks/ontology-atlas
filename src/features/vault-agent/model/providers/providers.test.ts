// 벤더 3사가 하나의 모양으로 접히는지 — 픽스처 기반 정규화 계약.
//
// 벤더가 형식을 바꾸면 여기서 먼저 깨진다. 어댑터만 고치고 픽스처를 두면
// "우리 코드가 상상한 벤더" 를 테스트하게 되므로, 둘은 같이 갱신한다.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { AGENT_TOOLS, findAgentTool } from '../tool-catalog';
import type { TurnAssembly } from '../provider-adapter';
import { PROVIDER_ADAPTERS } from './index';

const FIXTURES = join(__dirname, '../../../../../tests/fixtures/llm-providers');

function fixture(name: string): string {
  return readFileSync(join(FIXTURES, `${name}.json`), 'utf-8');
}

function assembly(overrides: Partial<TurnAssembly> = {}): TurnAssembly {
  return {
    model: 'test-model',
    system: '너는 이 볼트의 의미 계층을 설계하는 에이전트다.',
    userText: '이 노드에 빠진 관계 이어줘',
    screenContextBlock: '<screen_context>결제 처리</screen_context>',
    exchanges: [],
    tools: AGENT_TOOLS,
    ...overrides,
  };
}

describe('벤더 어댑터 — 셋이 같은 모양으로 접힌다', () => {
  for (const provider of ['anthropic', 'openai', 'gemini'] as const) {
    describe(provider, () => {
      const adapter = PROVIDER_ADAPTERS[provider];

      it('텍스트만 있는 응답은 인용을 담은 한 덩어리로 읽힌다', () => {
        const result = adapter.parseResponse(fixture(`${provider}-text`));
        expect(result.stop).toBe('end');
        expect(result.toolCalls).toHaveLength(0);
        expect(result.text).toContain('[[capabilities/payment]]');
      });

      it('도구 호출은 이름·인자가 같은 자리로 정규화된다', () => {
        const result = adapter.parseResponse(fixture(`${provider}-tool`));
        expect(result.stop).toBe('tool');
        expect(result.toolCalls[0].name).toBe('get_concept');
        expect(result.toolCalls[0].args).toEqual({ slug: 'capabilities/payment' });
        // id 가 비면 결과를 되돌려 보낼 자리가 사라진다 — 없으면 합성한다.
        expect(result.toolCalls[0].id).toBeTruthy();
      });

      it('오류/차단은 조용한 빈 답이 아니라 강등된 결과로 나온다', () => {
        const result = adapter.parseResponse(fixture(`${provider}-error`));
        expect(['error', 'refusal']).toContain(result.stop);
        expect(result.errorMessage).toBeTruthy();
      });

      it('요청 본문은 도구 목록 전체를 싣고 파싱 가능한 JSON 이다', () => {
        const body = adapter.buildBody(assembly());
        const parsed = JSON.parse(body) as Record<string, unknown>;
        expect(JSON.stringify(parsed)).toContain('get_concept');
        expect(JSON.stringify(parsed)).toContain('이 노드에 빠진 관계 이어줘');
        // 화면 문맥은 매 턴 자동 주입된다 — 모델이 부를 필요가 없다.
        expect(JSON.stringify(parsed)).toContain('screen_context');
      });

      it('assistant 턴 원문을 그대로 되돌려 싣는다', () => {
        // 재조립하면 Anthropic 의 thinking 블록이 사라져 다음 왕복이 거절된다.
        const first = adapter.parseResponse(fixture(`${provider}-tool`));
        const body = adapter.buildBody(
          assembly({
            exchanges: [
              {
                assistant: first.raw,
                toolResults: [
                  {
                    id: first.toolCalls[0].id,
                    name: 'get_concept',
                    content: '{"slug":"capabilities/payment"}',
                    isError: false,
                  },
                ],
              },
            ],
          }),
        );
        expect(body).toContain('capabilities/payment');
        expect(() => JSON.parse(body)).not.toThrow();
      });
    });
  }

  it('OpenAI 의 깨진 arguments 는 실행 전에 걸린다', () => {
    // 이 벤더만 arguments 가 문자열이라 모델이 잘린 JSON 을 뱉을 수 있다.
    const result = PROVIDER_ADAPTERS.openai.parseResponse(fixture('openai-tool'));
    expect(result.toolCalls[1].name).toBe('find_backlinks');
    expect(result.toolCalls[1].argsInvalid).toBe(true);
  });

  it('Gemini 는 id 를 주지 않으므로 실행기가 합성한다', () => {
    const result = PROVIDER_ADAPTERS.gemini.parseResponse(fixture('gemini-tool'));
    expect(result.toolCalls[0].id).toBe('g0');
  });

  it('Gemini 스키마에서 지원하지 않는 키는 떨어져 나간다', () => {
    // 모르는 키가 하나라도 남으면 요청 전체가 400 이 된다.
    const body = PROVIDER_ADAPTERS.gemini.buildBody(assembly());
    expect(body).not.toContain('additionalProperties');
    expect(body).not.toContain('"minimum"');
    // 인자가 없는 도구는 parameters 자체가 빠진다.
    const parsed = JSON.parse(body) as {
      tools: Array<{ functionDeclarations: Array<{ name: string; parameters?: unknown }> }>;
    };
    const listKinds = parsed.tools[0].functionDeclarations.find((d) => d.name === 'list_kinds');
    expect(listKinds?.parameters).toBeUndefined();
  });

  it('벤더 기본 모델은 셋 다 정해져 있다', () => {
    // 키 등록이 3사로 출하됐는데 대화가 2사면 화면이 자기를 반박한다.
    for (const provider of ['anthropic', 'openai', 'gemini'] as const) {
      expect(PROVIDER_ADAPTERS[provider].defaultModel).toBeTruthy();
    }
  });

  it('주소 갈래는 로컬 사고를 끄고 세 번 읽은 뒤 답을 강제한다', () => {
    // 첫 왕복은 시스템 규율상 반드시 읽기 도구를 골라야 한다. Ollama 실물에서
    // generic required 는 무시될 수 있어 전체 지도는 list_concepts 로 이름을 고정한다.
    const firstTurn = assembly({ model: 'qwen3:8b' });
    const firstLocal = JSON.parse(
      PROVIDER_ADAPTERS.local.buildBody(firstTurn),
    ) as Record<string, unknown>;
    const firstOpenAi = JSON.parse(
      PROVIDER_ADAPTERS.openai.buildBody(firstTurn),
    ) as Record<string, unknown>;
    expect(firstLocal).toEqual({
      ...firstOpenAi,
      tools: (firstOpenAi.tools as Array<{ function: { name: string } }>).filter(
        (tool) => tool.function.name === 'list_kinds',
      ),
      reasoning_effort: 'none',
      tool_choice: { type: 'function', function: { name: 'list_kinds' } },
    });
    expect(
      (firstLocal.tools as Array<{ function: { name: string } }>).map(
        (tool) => tool.function.name,
      ),
    ).toEqual(['list_kinds']);

    const focusedFirst = JSON.parse(
      PROVIDER_ADAPTERS.local.buildBody(
        assembly({
          model: 'qwen3:8b',
          screenContextBlock:
            '<screen_context>\nlooking_at: capabilities/payment (결제 · kind=capability)\n</screen_context>',
        }),
      ),
    ) as Record<string, unknown>;
    expect(focusedFirst.tool_choice).toEqual({
      type: 'function',
      function: { name: 'get_concept' },
    });
    expect(
      (focusedFirst.tools as Array<{ function: { name: string } }>).map(
        (tool) => tool.function.name,
      ),
    ).toEqual(['get_concept']);

    const evidenceTurn = assembly({
      model: 'qwen3:8b',
      exchanges: [
        {
          assistant: { role: 'assistant', tool_calls: [{ id: 'o0' }] },
          toolResults: [
            {
              id: 'o0',
              name: 'list_kinds',
              content: '{"total":70}',
              isError: false,
            },
          ],
        },
      ],
    });
    const evidenceLocal = JSON.parse(
      PROVIDER_ADAPTERS.local.buildBody(evidenceTurn),
    ) as Record<string, unknown>;
    const evidenceOpenAi = JSON.parse(
      PROVIDER_ADAPTERS.openai.buildBody(evidenceTurn),
    ) as Record<string, unknown>;
    expect(evidenceLocal).toEqual({
      ...evidenceOpenAi,
      tools: (evidenceOpenAi.tools as Array<{ function: { name: string } }>).filter(
        (tool) => tool.function.name === 'list_concepts',
      ),
      reasoning_effort: 'none',
      tool_choice: { type: 'function', function: { name: 'list_concepts' } },
    });
    expect(
      (evidenceLocal.tools as Array<{ function: { name: string } }>).map(
        (tool) => tool.function.name,
      ),
    ).toEqual(['list_concepts']);

    const detailTurn = assembly({
      model: 'qwen3:8b',
      exchanges: [
        ...evidenceTurn.exchanges,
        {
          assistant: { role: 'assistant', tool_calls: [{ id: 'o1' }] },
          toolResults: [
            {
              id: 'o1',
              name: 'list_concepts',
              content: '{"nodes":[]}',
              isError: false,
            },
          ],
        },
      ],
    });
    const detailLocal = JSON.parse(
      PROVIDER_ADAPTERS.local.buildBody(detailTurn),
    ) as Record<string, unknown>;
    expect(detailLocal.reasoning_effort).toBe('none');
    expect(detailLocal.tool_choice).toEqual({
      type: 'function',
      function: { name: 'get_concepts' },
    });
    expect(
      (detailLocal.tools as Array<{ function: { name: string } }>).map(
        (tool) => tool.function.name,
      ),
    ).toEqual(['get_concepts']);

    const closingTurn = { ...evidenceTurn, tools: [] };
    const closingLocal = JSON.parse(
      PROVIDER_ADAPTERS.local.buildBody(closingTurn),
    ) as Record<string, unknown>;
    const closingOpenAi = JSON.parse(
      PROVIDER_ADAPTERS.openai.buildBody(closingTurn),
    ) as Record<string, unknown>;
    expect(closingLocal).toEqual({
      ...closingOpenAi,
      messages: [
        ...(closingOpenAi.messages as unknown[]),
        {
          role: 'user',
          content:
            'Tool access is closed. Answer the original question now, in the same language as the person, from only the evidence you verified. Cite exact slugs you read and mark every uninspected area incomplete. For a structure audit, a census, list, child count, fan-out number, or mix of kinds only selects suspects; none proves a defect, a preferred node count, or a bridge. Never invent or recommend a numeric node target. Recommend a bridge only when the bodies and resolved neighbors you read establish at least three exact sibling slugs that share one behavior, and state that behavior in one sentence. Absence of that evidence proves neither that a bridge is needed nor that it is unnecessary; say only that the verified scope does not establish one. Do not describe another plan or tool call.',
        },
      ],
      reasoning_effort: 'none',
    });

    const thirdEvidenceTurn = assembly({
      model: 'qwen3:8b',
      exchanges: [
        evidenceTurn.exchanges[0]!,
        detailTurn.exchanges[1]!,
        {
          assistant: { role: 'assistant', tool_calls: [{ id: 'o2' }] },
          toolResults: [
            {
              id: 'o2',
              name: 'get_concepts',
              content:
                '{"concepts":[{"slug":"domains/agent-experience","found":true}]}',
              isError: false,
            },
          ],
        },
      ],
    });
    const forcedSynthesis = JSON.parse(
      PROVIDER_ADAPTERS.local.buildBody(thirdEvidenceTurn),
    ) as Record<string, unknown>;
    expect(forcedSynthesis.tools).toEqual([]);
    expect(forcedSynthesis.reasoning_effort).toBe('none');
    expect(forcedSynthesis).not.toHaveProperty('tool_choice');
    expect((forcedSynthesis.messages as Array<{ content?: string }>).at(-1)?.content).toContain(
      'at least three exact sibling slugs',
    );
    expect((forcedSynthesis.messages as Array<{ content?: string }>).at(-1)?.content).toContain(
      'Only these concept evidence rows were delivered: [[domains/agent-experience]]. They were found',
    );
    expect((forcedSynthesis.messages as Array<{ content?: string }>).at(-1)?.content).toContain(
      'Treat every bodyInfo, neighborsInfo, and frontmatterInfo truncation marker as an evidence boundary',
    );
    expect((forcedSynthesis.messages as Array<{ content?: string }>).at(-1)?.content).toContain(
      'Fewer than three concept evidence rows survived the evidence cap',
    );
    expect(firstOpenAi).not.toHaveProperty('reasoning_effort');
    expect(firstOpenAi).not.toHaveProperty('tool_choice');
    const body = fixture('openai-tool');
    expect(PROVIDER_ADAPTERS.local.parseResponse(body)).toEqual(
      PROVIDER_ADAPTERS.openai.parseResponse(body),
    );
  });

  it('주소 갈래는 상세 읽기 뒤 인용·한국어 응답을 각각 한 번만 교정한다', () => {
    const evidenceTurn = assembly({
      model: 'qwen3:8b',
      exchanges: [
        {
          assistant: { role: 'assistant', tool_calls: [{ id: 'o0' }] },
          toolResults: [
            { id: 'o0', name: 'list_kinds', content: '{}', isError: false },
          ],
        },
        {
          assistant: { role: 'assistant', tool_calls: [{ id: 'o1' }] },
          toolResults: [
            { id: 'o1', name: 'list_concepts', content: '{}', isError: false },
          ],
        },
        {
          assistant: { role: 'assistant', tool_calls: [{ id: 'o2' }] },
          toolResults: [
            {
              id: 'o2',
              name: 'get_concepts',
              content:
                '{"concepts":[{"slug":"domains/catalog","found":true},{"slug":"domains/order","found":true}]}',
              isError: false,
            },
          ],
        },
      ],
    });
    const unsupported = PROVIDER_ADAPTERS.local.parseResponse(
      JSON.stringify({
        choices: [
          {
            message: { role: 'assistant', content: '읽은 개념이 모두 없었습니다.' },
            finish_reason: 'stop',
          },
        ],
      }),
    );
    const retry = PROVIDER_ADAPTERS.local.reviewResponse?.(evidenceTurn, unsupported);
    expect(retry).toMatchObject({ action: 'retry', expectedTool: 'verified-citation' });

    const retriedTurn = assembly({
      ...evidenceTurn,
      exchanges: [
        ...evidenceTurn.exchanges,
        {
          assistant: unsupported.raw,
          toolResults: [],
          retry: {
            expectedTool: 'verified-citation',
            instruction: retry?.action === 'retry' ? retry.message : '',
          },
        },
      ],
    });
    expect(PROVIDER_ADAPTERS.local.reviewResponse?.(retriedTurn, unsupported)).toMatchObject({
      action: 'fail',
      expectedTool: 'verified-citation',
    });

    const wrongLanguage = PROVIDER_ADAPTERS.local.parseResponse(
      JSON.stringify({
        choices: [
          {
            message: {
              role: 'assistant',
              content: 'Only [[domains/catalog]] was inspected.',
            },
            finish_reason: 'stop',
          },
        ],
      }),
    );
    expect(PROVIDER_ADAPTERS.local.reviewResponse?.(evidenceTurn, wrongLanguage)).toMatchObject({
      action: 'retry',
      expectedTool: 'response-language',
    });
    const languageRetriedTurn = assembly({
      ...evidenceTurn,
      exchanges: [
        ...evidenceTurn.exchanges,
        {
          assistant: wrongLanguage.raw,
          toolResults: [],
          retry: {
            expectedTool: 'response-language',
            instruction: 'Answer again in Korean.',
          },
        },
      ],
    });
    expect(
      PROVIDER_ADAPTERS.local.reviewResponse?.(languageRetriedTurn, wrongLanguage),
    ).toMatchObject({ action: 'fail', expectedTool: 'response-language' });

    const cited = PROVIDER_ADAPTERS.local.parseResponse(
      JSON.stringify({
        choices: [
          {
            message: {
              role: 'assistant',
              content: '[[domains/catalog]]과 [[domains/order]]만 확인했습니다.',
            },
            finish_reason: 'stop',
          },
        ],
      }),
    );
    expect(PROVIDER_ADAPTERS.local.reviewResponse?.(evidenceTurn, cited)).toEqual({
      action: 'accept',
    });
  });

  it('주소 갈래에는 기본 모델이 없다 — 그 컴퓨터만 아는 사실이라서', () => {
    // 아무 이름이나 기본값으로 박아 두면 첫 왕복이 "model not found" 로 죽고,
    // 그 이유가 화면 어디에도 없다. 사용자가 목록에서 고를 때까지 이 갈래는
    // 켜지지 않는다(`isLocalEndpointReady`).
    expect(PROVIDER_ADAPTERS.local.defaultModel).toBe('');
  });

  it('주소 갈래는 필수 읽기 생략을 정상 답으로 받지 않는다', () => {
    const turn = assembly({ model: 'qwen3:8b' });
    const response = PROVIDER_ADAPTERS.local.parseResponse(
      JSON.stringify({
        choices: [
          {
            message: { role: 'assistant', content: '먼저 조사하겠습니다.' },
            finish_reason: 'stop',
          },
        ],
      }),
    );
    const retry = PROVIDER_ADAPTERS.local.reviewResponse?.(turn, response);
    expect(retry).toMatchObject({ action: 'retry', expectedTool: 'list_kinds' });

    const retriedTurn = assembly({
      model: 'qwen3:8b',
      exchanges: [
        {
          assistant: response.raw,
          toolResults: [],
          retry: {
            expectedTool: 'list_kinds',
            instruction: retry?.action === 'retry' ? retry.message : '',
          },
        },
      ],
    });
    const retriedBody = JSON.parse(
      PROVIDER_ADAPTERS.local.buildBody(retriedTurn),
    ) as { tool_choice: { function: { name: string } }; tools: unknown[] };
    expect(retriedBody.tool_choice.function.name).toBe('list_kinds');
    expect(retriedBody.tools).toHaveLength(1);
    expect(PROVIDER_ADAPTERS.local.reviewResponse?.(retriedTurn, response)).toMatchObject({
      action: 'fail',
      expectedTool: 'list_kinds',
    });
  });

  it('쓰기 도구도 목록에는 실린다 — 막는 곳은 실행기다', () => {
    expect(findAgentTool('patch_concept')?.effect).toBe('write');
    expect(findAgentTool('get_concept')?.effect).toBe('read');
    // 볼트 밖 소스 스캔 도구는 애초에 주지 않는다.
    expect(findAgentTool('analyze_repo_structure')).toBeUndefined();
    expect(findAgentTool('index_project')).toBeUndefined();
    expect(findAgentTool('delete_concept')).toBeUndefined();
  });
});
