import type {
  NormalizedResponse,
  NormalizedStop,
  NormalizedToolCall,
  ProviderAdapter,
  TurnAssembly,
} from '../provider-adapter';
import { PROVIDER_DEFAULT_MODELS, readVendorErrorMessage } from '../provider-adapter';

/**
 * The OpenAI Chat Completions adapter.
 *
 * Two things differ from the other vendors:
 * ① A tool call's `arguments` is **a string** — the model can emit broken JSON, and
 *    then it is blocked before execution and the error is returned to the model.
 * ② The output token cap is **not sent.** The parameter name differs by model
 *    generation (`max_tokens` vs `max_completion_tokens`), and the wrong name gets
 *    the whole request rejected. Omitting it uses the model's default — the turn
 *    limit is already held by our own round-trip cap.
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
    // This vendor has no error flag — it has to be said in a sentence for the model to know.
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
      // The assistant turn to send back verbatim in the next round trip.
      raw: message ?? { role: 'assistant', content: text },
    };
  },
};
