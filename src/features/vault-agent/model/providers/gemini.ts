import type {
  NormalizedResponse,
  NormalizedStop,
  NormalizedToolCall,
  ProviderAdapter,
  TurnAssembly,
} from '../provider-adapter';
import {
  PROVIDER_DEFAULT_MODELS,
  hasParameters,
  readVendorErrorMessage,
  toGeminiSchema,
} from '../provider-adapter';

/**
 * The Gemini generateContent adapter.
 *
 * Three things differ:
 * ① A tool call **has no id** — `g{n}` is synthesized so the executor can send the
 *    result back. Results are paired by **name**, not by id.
 * ② Safety blocks arrive inside the response as `promptFeedback.blockReason` /
 *    `finishReason` (with HTTP 200). Leaving that as a quiet empty answer makes the
 *    screen lie, so it is demoted.
 * ③ The schema is an OpenAPI subset, so leaving an unknown key gives a 400 —
 *    `toGeminiSchema` keeps only allowed keys.
 */

interface GeminiPart {
  text?: string;
  functionCall?: { name?: string; args?: unknown };
}

function mapStop(reason: unknown, hasToolCall: boolean): NormalizedStop {
  if (hasToolCall) return 'tool';
  switch (reason) {
    case 'STOP':
      return 'end';
    case 'MAX_TOKENS':
      return 'length';
    case 'SAFETY':
    case 'PROHIBITED_CONTENT':
    case 'BLOCKLIST':
      return 'refusal';
    default:
      return 'other';
  }
}

export const geminiAdapter: ProviderAdapter = {
  provider: 'gemini',
  defaultModel: PROVIDER_DEFAULT_MODELS.gemini,

  buildBody(turn: TurnAssembly): string {
    const contents: unknown[] = [
      {
        role: 'user',
        parts: [{ text: `${turn.screenContextBlock}\n\n${turn.userText}` }],
      },
    ];
    for (const exchange of turn.exchanges) {
      contents.push(exchange.assistant);
      contents.push({
        role: 'user',
        parts: exchange.toolResults.map((result) => ({
          functionResponse: {
            name: result.name,
            // `response` must be an object — passing a string directly is rejected.
            response: result.isError ? { error: result.content } : { result: result.content },
          },
        })),
      });
    }
    return JSON.stringify({
      systemInstruction: { parts: [{ text: turn.system }] },
      contents,
      tools: [
        {
          functionDeclarations: turn.tools.map((tool) => ({
            name: tool.name,
            description: tool.description,
            ...(hasParameters(tool.parameters)
              ? { parameters: toGeminiSchema(tool.parameters) }
              : {}),
          })),
        },
      ],
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
    const root = parsed as {
      candidates?: Array<{ content?: { parts?: GeminiPart[] }; finishReason?: unknown }>;
      promptFeedback?: { blockReason?: unknown };
    };
    const blockReason = root.promptFeedback?.blockReason;
    if (typeof blockReason === 'string' && blockReason) {
      return {
        text: '',
        toolCalls: [],
        stop: 'refusal',
        raw: null,
        errorMessage: blockReason,
      };
    }
    const candidate = root.candidates?.[0];
    if (!candidate) {
      return { text: '', toolCalls: [], stop: 'error', raw: null };
    }
    const parts = Array.isArray(candidate.content?.parts) ? candidate.content.parts : [];
    const text = parts
      .filter((part) => typeof part.text === 'string')
      .map((part) => part.text as string)
      .join('\n');
    const toolCalls: NormalizedToolCall[] = parts
      .filter((part) => part.functionCall && typeof part.functionCall.name === 'string')
      .map((part, index) => ({
        id: `g${index}`,
        name: part.functionCall?.name as string,
        args: part.functionCall?.args ?? {},
        argsInvalid: false,
      }));
    const stop = mapStop(candidate.finishReason, toolCalls.length > 0);
    return {
      text,
      toolCalls,
      stop,
      raw: candidate.content ?? { role: 'model', parts: [] },
      errorMessage:
        stop === 'refusal' && typeof candidate.finishReason === 'string'
          ? candidate.finishReason
          : undefined,
    };
  },
};
