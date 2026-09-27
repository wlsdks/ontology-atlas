// Fixture-based normalization contract: update fixtures with the adapter, never the adapter alone.
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

describe('vendor adapters fold into one shape', () => {
  for (const provider of ['anthropic', 'openai', 'gemini'] as const) {
    describe(provider, () => {
      const adapter = PROVIDER_ADAPTERS[provider];

      it('reads a text-only response as one chunk carrying citations', () => {
        const result = adapter.parseResponse(fixture(`${provider}-text`));
        expect(result.stop).toBe('end');
        expect(result.toolCalls).toHaveLength(0);
        expect(result.text).toContain('[[capabilities/payment]]');
      });

      it('normalizes tool calls to the same name and arguments fields', () => {
        const result = adapter.parseResponse(fixture(`${provider}-tool`));
        expect(result.stop).toBe('tool');
        expect(result.toolCalls[0].name).toBe('get_concept');
        expect(result.toolCalls[0].args).toEqual({ slug: 'capabilities/payment' });
    // An empty id leaves nowhere to send the result back to — synthesize one when absent.
        expect(result.toolCalls[0].id).toBeTruthy();
      });

      it('returns an error or block as a degraded result, not a silent empty answer', () => {
        const result = adapter.parseResponse(fixture(`${provider}-error`));
        expect(['error', 'refusal']).toContain(result.stop);
        expect(result.errorMessage).toBeTruthy();
      });

      it('sends the full tool list in a parseable JSON request body', () => {
        const body = adapter.buildBody(assembly());
        const parsed = JSON.parse(body) as Record<string, unknown>;
        expect(JSON.stringify(parsed)).toContain('get_concept');
        expect(JSON.stringify(parsed)).toContain('이 노드에 빠진 관계 이어줘');
    // Screen context is injected automatically every turn — the model need not call for it.
        expect(JSON.stringify(parsed)).toContain('screen_context');
      });

      it('echoes the raw assistant turn back unchanged', () => {
    // Reassembling drops Anthropic's thinking blocks and the next round trip is rejected.
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

  it('catches malformed OpenAI arguments before execution', () => {
    // Only this vendor has arguments as a string, so the model can emit truncated JSON.
    const result = PROVIDER_ADAPTERS.openai.parseResponse(fixture('openai-tool'));
    expect(result.toolCalls[1].name).toBe('find_backlinks');
    expect(result.toolCalls[1].argsInvalid).toBe(true);
  });

  it('synthesizes a call id for Gemini, which sends none', () => {
    const result = PROVIDER_ADAPTERS.gemini.parseResponse(fixture('gemini-tool'));
    expect(result.toolCalls[0].id).toBe('g0');
  });

  it('drops schema keys Gemini does not support', () => {
    // One remaining unknown key makes the whole request a 400.
    const body = PROVIDER_ADAPTERS.gemini.buildBody(assembly());
    expect(body).not.toContain('additionalProperties');
    expect(body).not.toContain('"minimum"');
    // A tool with no arguments omits `parameters` entirely.
    const parsed = JSON.parse(body) as {
      tools: Array<{ functionDeclarations: Array<{ name: string; parameters?: unknown }> }>;
    };
    const listKinds = parsed.tools[0].functionDeclarations.find((d) => d.name === 'list_kinds');
    expect(listKinds?.parameters).toBeUndefined();
  });

  it('defines a default model for all three vendors', () => {
    // Registering three vendors while the conversation supports two would contradict the screen.
    for (const provider of ['anthropic', 'openai', 'gemini'] as const) {
      expect(PROVIDER_ADAPTERS[provider].defaultModel).toBeTruthy();
    }
  });

  it('local endpoint disables thinking and forces an answer after three reads', () => {
    // Ollama can ignore a generic `required`, so the whole-map case pins list_concepts by name.
    const firstTurn = assembly({ model: 'qwen3:8b' });
    const firstLocal = JSON.parse(
      PROVIDER_ADAPTERS.local.buildBody(firstTurn),
    ) as Record<string, unknown>;
    const firstOpenAi = JSON.parse(
      PROVIDER_ADAPTERS.openai.buildBody(firstTurn),
    ) as Record<string, unknown>;
    expect(firstLocal).toEqual({
      ...firstOpenAi,
      messages: [
        ...(firstOpenAi.messages as unknown[]),
        {
          role: 'user',
          content:
            'The required evidence read did not happen. Call list_kinds now. Do not answer or describe a plan.',
        },
      ],
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
    expect((focusedFirst.messages as Array<{ content?: string }>).at(-1)?.content).toBe(
      'The required evidence read did not happen. Call get_concept now. Do not answer or describe a plan.',
    );

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
      messages: [
        ...(evidenceOpenAi.messages as unknown[]),
        {
          role: 'user',
          content:
            'The required evidence read did not happen. Call list_concepts now. Do not answer or describe a plan.',
        },
      ],
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
    expect((detailLocal.messages as Array<{ content?: string }>).at(-1)?.content).toBe(
      'The required evidence read did not happen. Call get_concepts now. Do not answer or describe a plan.',
    );

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

  it('local endpoint corrects citations and Korean replies once each after the detail read', () => {
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

  it('local endpoint structure audit validates domain candidates and detail slug arguments', () => {
    const structuralQuestion =
      '온톨로지 구조를 감사해줘. fan-out만으로 브릿지를 만들지는 마.';
    const censusTurn = assembly({
      model: 'qwen3:8b',
      userText: structuralQuestion,
      exchanges: [
        {
          assistant: { role: 'assistant', tool_calls: [{ id: 'o0' }] },
          toolResults: [
            {
              id: 'o0',
              name: 'list_kinds',
              content: '{"total":112,"byKind":{"domain":8,"capability":49,"element":54}}',
              isError: false,
            },
          ],
        },
      ],
    });
    const wrongCandidateScope = PROVIDER_ADAPTERS.local.parseResponse(
      JSON.stringify(openAiTool('list_concepts', { kind: 'project', summary: true, limit: 12 })),
    );
    expect(
      PROVIDER_ADAPTERS.local.reviewResponse?.(censusTurn, wrongCandidateScope),
    ).toMatchObject({
      action: 'retry',
      expectedTool: 'list_concepts',
      message: expect.stringContaining('kind "domain"'),
    });

    const candidates = ['domains/catalog', 'domains/order', 'domains/payment', 'domains/support'];
    const candidateTurn = assembly({
      ...censusTurn,
      exchanges: [
        ...censusTurn.exchanges,
        {
          assistant: { role: 'assistant', tool_calls: [{ id: 'o1' }] },
          toolResults: [
            {
              id: 'o1',
              name: 'list_concepts',
              content: JSON.stringify({ rows: candidates.map((slug) => ({ slug })) }),
              isError: false,
            },
          ],
        },
      ],
    });
    const detailBody = JSON.parse(PROVIDER_ADAPTERS.local.buildBody(candidateTurn)) as {
      messages: Array<{ content?: string }>;
    };
    expect(detailBody.messages.at(-1)?.content).toContain(candidates.join(', '));
    expect(detailBody.messages.at(-1)?.content).toContain('body "full"');

    const shallowDetail = PROVIDER_ADAPTERS.local.parseResponse(
      JSON.stringify(openAiTool('get_concepts', { slugs: ['storefront'] })),
    );
    expect(PROVIDER_ADAPTERS.local.reviewResponse?.(candidateTurn, shallowDetail)).toMatchObject({
      action: 'retry',
      expectedTool: 'get_concepts',
      message: expect.stringContaining('domains/catalog'),
    });
    const completeDetail = PROVIDER_ADAPTERS.local.parseResponse(
      JSON.stringify(openAiTool('get_concepts', { slugs: candidates, body: 'full' })),
    );
    expect(PROVIDER_ADAPTERS.local.reviewResponse?.(candidateTurn, completeDetail)).toEqual({
      action: 'accept',
    });
  });

  it('local endpoint rejects a synthesis that contradicts the census or overstates narrow evidence', () => {
    const turn = assembly({
      model: 'qwen3:8b',
      userText: '이 온톨로지 구조를 감사해줘. 브릿지는 근거가 있을 때만 말해.',
      exchanges: [
        {
          assistant: { role: 'assistant', tool_calls: [{ id: 'o0' }] },
          toolResults: [
            {
              id: 'o0',
              name: 'list_kinds',
              content: '{"byKind":{"domain":8,"capability":49,"element":54}}',
              isError: false,
            },
          ],
        },
        {
          assistant: { role: 'assistant', tool_calls: [{ id: 'o1' }] },
          toolResults: [
            { id: 'o1', name: 'list_concepts', content: '{"rows":[]}', isError: false },
          ],
        },
        {
          assistant: { role: 'assistant', tool_calls: [{ id: 'o2' }] },
          toolResults: [
            {
              id: 'o2',
              name: 'get_concepts',
              content: '{"concepts":[{"slug":"storefront","found":true}]}',
              isError: false,
            },
          ],
        },
      ],
    });
    const contradiction = PROVIDER_ADAPTERS.local.parseResponse(
      JSON.stringify({
        choices: [
          {
            message: {
              role: 'assistant',
              content:
                '[[storefront]]에는 Capability 또는 Element가 정의되지 않았고 브릿지는 불필요합니다.',
            },
            finish_reason: 'stop',
          },
        ],
      }),
    );
    const retry = PROVIDER_ADAPTERS.local.reviewResponse?.(turn, contradiction);
    expect(retry).toMatchObject({
      action: 'retry',
      expectedTool: 'evidence-consistency',
      message: expect.stringContaining('capability=49'),
    });
    const retriedTurn = assembly({
      ...turn,
      exchanges: [
        ...turn.exchanges,
        {
          assistant: contradiction.raw,
          toolResults: [],
          retry: {
            expectedTool: 'evidence-consistency',
            instruction: retry?.action === 'retry' ? retry.message : '',
          },
        },
      ],
    });
    expect(PROVIDER_ADAPTERS.local.reviewResponse?.(retriedTurn, contradiction)).toMatchObject({
      action: 'fail',
      expectedTool: 'evidence-consistency',
    });
  });

  it('local endpoint has no default model because only that machine knows it', () => {
    // A pinned default fails the first round trip with "model not found".
    expect(PROVIDER_ADAPTERS.local.defaultModel).toBe('');
  });

  it('local endpoint does not accept an answer that skipped required reads', () => {
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

  it('lists write tools too because the executor is what blocks them', () => {
    expect(findAgentTool('patch_concept')?.effect).toBe('write');
    expect(findAgentTool('get_concept')?.effect).toBe('read');
    expect(findAgentTool('analyze_repo_structure')).toBeUndefined();
    expect(findAgentTool('index_project')).toBeUndefined();
    expect(findAgentTool('delete_concept')).toBeUndefined();
  });
});
