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

  it('쓰기 도구도 목록에는 실린다 — 막는 곳은 실행기다', () => {
    expect(findAgentTool('patch_concept')?.effect).toBe('write');
    expect(findAgentTool('get_concept')?.effect).toBe('read');
    // 볼트 밖 소스 스캔 도구는 애초에 주지 않는다.
    expect(findAgentTool('analyze_repo_structure')).toBeUndefined();
    expect(findAgentTool('index_project')).toBeUndefined();
    expect(findAgentTool('delete_concept')).toBeUndefined();
  });
});
