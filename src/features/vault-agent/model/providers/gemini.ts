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

import { invalidProviderResponse, isResponseObject, readResponseObject } from '../provider-response';

/**
 * Gemini adapter: tool calls have no id (`g{n}` is synthesized, results pair by name), safety
 * blocks in a 200 response are demoted, and schemas keep only allowed keys.
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
    const parsed = readResponseObject(body);
    if (!parsed) return invalidProviderResponse('$');
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
    const candidate = Array.isArray(root.candidates) ? root.candidates[0] : undefined;
    if (!isResponseObject(candidate)) return invalidProviderResponse('$.candidates[0]');
    const content = candidate.content ?? { role: 'model', parts: [] };
    if (!isResponseObject(content) || (content.parts != null && !Array.isArray(content.parts))) {
      return invalidProviderResponse('$.candidates[0].content.parts');
    }
    const parts = (content.parts ?? []) as GeminiPart[];
    if (parts.some((part) => !isResponseObject(part)
      || (part.text !== undefined && typeof part.text !== 'string')
      || (part.functionCall !== undefined && (!isResponseObject(part.functionCall)
        || typeof part.functionCall.name !== 'string' || !part.functionCall.name.trim())))) {
      return invalidProviderResponse('$.candidates[0].content.parts');
    }
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
      raw: content,
      errorMessage:
        stop === 'refusal' && typeof candidate.finishReason === 'string'
          ? candidate.finishReason
          : undefined,
    };
  },
};
