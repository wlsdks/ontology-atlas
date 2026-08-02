import type {
  NormalizedResponse,
  NormalizedStop,
  NormalizedToolCall,
  ProviderAdapter,
  TurnAssembly,
} from '../provider-adapter';
import { PROVIDER_DEFAULT_MODELS, readVendorErrorMessage } from '../provider-adapter';

/**
 * OpenAI Chat Completions 어댑터.
 *
 * 두 가지가 다른 벤더와 다르다:
 * ① tool call 의 `arguments` 가 **문자열**이다 — 모델이 깨진 JSON 을 뱉을 수
 *    있고, 그때는 실행 전에 막고 오류를 모델에게 돌려준다(§ 실패 경로).
 * ② 출력 토큰 상한을 **싣지 않는다.** 파라미터 이름이 모델 세대별로 갈리고
 *    (`max_tokens` vs `max_completion_tokens`), 틀린 이름은 요청 전체를
 *    거절시킨다. 생략하면 모델 기본값이 쓰인다 — 턴 상한은 우리 쪽 왕복 상한이
 *    이미 지키고 있다.
 */

interface OpenAiToolCall {
  id?: string;
  function?: { name?: string; arguments?: string };
}

function mapStop(reason: unknown, hasToolCall: boolean): NormalizedStop {
  if (hasToolCall) return 'tool';
  switch (reason) {
    case 'stop':
      return 'end';
    case 'tool_calls':
    case 'function_call':
      return 'tool';
    case 'length':
      return 'length';
    case 'content_filter':
      return 'refusal';
    default:
      return 'other';
  }
}

export const openaiAdapter: ProviderAdapter = {
  provider: 'openai',
  defaultModel: PROVIDER_DEFAULT_MODELS.openai,

  buildBody(turn: TurnAssembly): string {
    const messages: unknown[] = [
      { role: 'system', content: turn.system },
      { role: 'user', content: `${turn.screenContextBlock}\n\n${turn.userText}` },
    ];
    for (const exchange of turn.exchanges) {
      messages.push(exchange.assistant);
      for (const result of exchange.toolResults) {
        messages.push({
          role: 'tool',
          tool_call_id: result.id,
          // 이 벤더에는 오류 플래그가 없다 — 문장으로 말해야 모델이 안다.
          content: result.isError ? `ERROR: ${result.content}` : result.content,
        });
      }
      if (exchange.retry) {
        messages.push({ role: 'user', content: exchange.retry.instruction });
      }
    }
    return JSON.stringify({
      model: turn.model,
      messages,
      tools: turn.tools.map((tool) => ({
        type: 'function',
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters,
        },
      })),
    });
  },

  parseResponse(body: string): NormalizedResponse {
    let parsed: unknown;
    try {
      parsed = JSON.parse(body);
    } catch {
      return { text: '', toolCalls: [], stop: 'error', raw: null };
    }
    const vendorError = readVendorErrorMessage(parsed);
    if (vendorError) {
      return { text: '', toolCalls: [], stop: 'error', raw: null, errorMessage: vendorError };
    }
    const choice = (parsed as { choices?: Array<Record<string, unknown>> }).choices?.[0];
    if (!choice) {
      return { text: '', toolCalls: [], stop: 'error', raw: null };
    }
    const message = choice.message as
      | { content?: unknown; tool_calls?: OpenAiToolCall[] }
      | undefined;
    const text = typeof message?.content === 'string' ? message.content : '';
    const rawCalls = Array.isArray(message?.tool_calls) ? message.tool_calls : [];
    const toolCalls: NormalizedToolCall[] = rawCalls.map((call, index) => {
      const name = call.function?.name ?? '';
      const rawArgs = call.function?.arguments;
      let args: unknown = {};
      let argsInvalid = false;
      if (typeof rawArgs === 'string' && rawArgs.trim()) {
        try {
          args = JSON.parse(rawArgs);
        } catch {
          argsInvalid = true;
        }
      }
      return {
        id: typeof call.id === 'string' && call.id ? call.id : `o${index}`,
        name,
        args,
        argsInvalid,
      };
    });
    return {
      text,
      toolCalls,
      stop: mapStop(choice.finish_reason, toolCalls.length > 0),
      // 다음 왕복에 그대로 되돌려 보낼 assistant 턴.
      raw: message ?? { role: 'assistant', content: text },
    };
  },
};
