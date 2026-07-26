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
 * Gemini generateContent 어댑터.
 *
 * 세 가지가 다르다:
 * ① tool call 에 **id 가 없다** — 실행기가 결과를 되돌려 보낼 수 있도록
 *    `g{n}` 을 합성한다. 결과는 id 가 아니라 **이름**으로 짝지어진다.
 * ② 안전 차단이 응답 안의 `promptFeedback.blockReason` / `finishReason` 으로
 *    온다 (HTTP 200). 조용히 빈 답으로 두면 화면이 거짓말을 하므로 강등한다.
 * ③ 스키마가 OpenAPI 부분집합이라 모르는 키를 남기면 400 이 된다 —
 *    `toGeminiSchema` 가 허용 키만 남긴다.
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
            // response 는 반드시 객체다 — 문자열을 그대로 넣으면 거절된다.
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
