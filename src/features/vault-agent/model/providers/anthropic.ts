import type {
  NormalizedResponse,
  NormalizedStop,
  NormalizedToolCall,
  ProviderAdapter,
  TurnAssembly,
} from '../provider-adapter';
import { PROVIDER_DEFAULT_MODELS, readVendorErrorMessage } from '../provider-adapter';

/**
 * Anthropic Messages 어댑터.
 *
 * 주의할 점 하나: assistant 턴을 되돌려 보낼 때 **응답의 `content` 배열을
 * 그대로** 싣는다. 텍스트만 뽑아 재조립하면 thinking 블록이 사라져 다음
 * 왕복이 거절된다 — 원문 보존이 계약이다.
 */

/**
 * 출력 상한. 이 모델은 사고가 기본으로 켜져 있어 `max_tokens` 가
 * 사고 + 답변을 함께 덮는다 — 빠듯하면 답이 중간에 잘린다.
 */
const MAX_TOKENS = 8_192;

interface AnthropicBlock {
  type: string;
  text?: string;
  id?: string;
  name?: string;
  input?: unknown;
}

function mapStop(reason: unknown, hasToolCall: boolean): NormalizedStop {
  if (hasToolCall) return 'tool';
  switch (reason) {
    case 'end_turn':
    case 'stop_sequence':
      return 'end';
    case 'tool_use':
      return 'tool';
    case 'max_tokens':
      return 'length';
    case 'refusal':
      return 'refusal';
    default:
      return 'other';
  }
}

export const anthropicAdapter: ProviderAdapter = {
  provider: 'anthropic',
  defaultModel: PROVIDER_DEFAULT_MODELS.anthropic,

  buildBody(turn: TurnAssembly): string {
    const messages: unknown[] = [
      {
        role: 'user',
        content: `${turn.screenContextBlock}\n\n${turn.userText}`,
      },
    ];
    for (const exchange of turn.exchanges) {
      messages.push({ role: 'assistant', content: exchange.assistant });
      messages.push({
        role: 'user',
        content: exchange.toolResults.map((result) => ({
          type: 'tool_result',
          tool_use_id: result.id,
          content: result.content,
          ...(result.isError ? { is_error: true } : {}),
        })),
      });
    }
    return JSON.stringify({
      model: turn.model,
      max_tokens: MAX_TOKENS,
      system: turn.system,
      tools: turn.tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        input_schema: tool.parameters,
      })),
      messages,
    });
  },

  parseResponse(body: string): NormalizedResponse {
    let parsed: unknown;
    try {
      parsed = JSON.parse(body);
    } catch {
      return { text: '', toolCalls: [], stop: 'error', raw: [], errorMessage: undefined };
    }
    const vendorError = readVendorErrorMessage(parsed);
    if (vendorError) {
      return { text: '', toolCalls: [], stop: 'error', raw: [], errorMessage: vendorError };
    }
    const root = parsed as { content?: AnthropicBlock[]; stop_reason?: unknown };
    const blocks = Array.isArray(root.content) ? root.content : [];
    const text = blocks
      .filter((block) => block.type === 'text' && typeof block.text === 'string')
      .map((block) => block.text as string)
      .join('\n');
    const toolCalls: NormalizedToolCall[] = blocks
      .filter((block) => block.type === 'tool_use' && typeof block.name === 'string')
      .map((block, index) => ({
        // 벤더가 id 를 빠뜨릴 이유는 없지만, 없으면 결과를 되돌려 보낼 자리가
        // 사라진다 — 합성해서 왕복이 끊기지 않게 한다.
        id: typeof block.id === 'string' && block.id ? block.id : `a${index}`,
        name: block.name as string,
        // Anthropic 은 이미 객체로 준다 — 파싱 실패 경로가 없다.
        args: block.input ?? {},
        argsInvalid: false,
      }));
    return {
      text,
      toolCalls,
      stop: mapStop(root.stop_reason, toolCalls.length > 0),
      raw: blocks,
    };
  },
};
