import type {
  NormalizedResponse,
  NormalizedStop,
  NormalizedToolCall,
  ProviderAdapter,
  TurnAssembly,
} from '../provider-adapter';
import { PROVIDER_DEFAULT_MODELS, readVendorErrorMessage } from '../provider-adapter';

/**
 * The Anthropic Messages adapter.
 *
 * One thing to watch: when sending an assistant turn back, carry **the response's
 * `content` array verbatim**. Extracting the text and reassembling drops the thinking
 * blocks and the next round trip is rejected — preserving the original is the contract.
 */

/**
 * The output cap. This model has thinking on by default, so `max_tokens` covers
 * thinking plus the answer together — set too tight, the answer is cut off mid-way.
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
        // There is no reason for the vendor to omit an id, but without one there is
        // nowhere to send the result back to — synthesize one so the round trip is not broken.
        id: typeof block.id === 'string' && block.id ? block.id : `a${index}`,
        name: block.name as string,
        // Anthropic already gives an object — there is no parse-failure path.
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
