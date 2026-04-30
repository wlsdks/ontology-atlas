/**
 * LLM client — Anthropic Claude Messages API 호출.
 *
 * 목표: T-4d 의 self-contained 단위. fetch 기반, 외부 SDK 없음 (functions/
 * 디렉토리에서도 같은 wire 형식으로 import 해 사용 가능).
 *
 * - Node 20+ 의 native fetch 사용. 브라우저 fetch 와 호환.
 * - AbortController 로 timeout. 기본 30s.
 * - 비정상 응답 (인증 오류 / rate limit / 5xx / 파싱 실패) 은 typed error.
 * - 토큰 사용량 + 레이턴시 항상 보고 (비용·성능 측정용 — C-1 cutover 단가
 *   ≤ $0.05/page 추적의 1차 데이터).
 */

export interface CallClaudeInput {
  /** Anthropic API key (Functions secret 에서 주입). */
  apiKey: string;
  /** system prompt (T-4c buildExtractionPrompt result.system). */
  system: string;
  /** user prompt (T-4c buildExtractionPrompt result.user). */
  user: string;
  /** 모델 ID. 기본 claude-sonnet-4-6. */
  model?: string;
  /** 최대 출력 토큰. 기본 4096. */
  maxTokens?: number;
  /**
   * 샘플링 온도. 기본 0 — 같은 doc 재추출 시 결과 분산 최소화.
   * T-11 정확도 측정의 재현성을 위해 결정적 동작이 default. 창의적 변주가
   * 필요한 별도 모드(없음)에서만 override.
   */
  temperature?: number;
  /** 요청 타임아웃 (ms). 기본 30000. */
  timeoutMs?: number;
  /** API base URL. 기본 https://api.anthropic.com. 테스트에서 mock 서버로 swap. */
  baseUrl?: string;
  /** anthropic-version 헤더. 기본 2023-06-01. */
  anthropicVersion?: string;
  /** fetch 함수 — 기본 globalThis.fetch. 테스트 시 주입 가능. */
  fetch?: typeof globalThis.fetch;
}

export interface LlmUsage {
  inputTokens: number;
  outputTokens: number;
  /** 예상 비용 (USD) — 모델별 단가 적용 후 계산. 모르면 undefined. */
  estimatedCostUsd?: number;
}

export interface LlmCallResult {
  /** Claude 가 반환한 텍스트 (전체 content blocks 를 join 한 plain text). */
  text: string;
  /** 토큰 / 비용. */
  usage: LlmUsage;
  /** 끝까지 받는데 걸린 시간 (ms). */
  latencyMs: number;
  /** 모델 ID (응답 echo). */
  model: string;
  /** stop reason (`end_turn` / `max_tokens` / `stop_sequence` / `tool_use`). */
  stopReason: string | null;
}

export class LlmCallError extends Error {
  constructor(
    public readonly code:
      | 'auth'
      | 'rate_limit'
      | 'server_error'
      | 'timeout'
      | 'invalid_response'
      | 'network',
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'LlmCallError';
  }
}

const DEFAULT_MODEL = 'claude-sonnet-4-6';
const DEFAULT_MAX_TOKENS = 4096;
const DEFAULT_TEMPERATURE = 0;
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_BASE_URL = 'https://api.anthropic.com';
const DEFAULT_ANTHROPIC_VERSION = '2023-06-01';

/**
 * 모델별 단가 (USD per 1M tokens). 출처: Anthropic 공식 가격표 시점 캡처.
 * 가격 변경 시 이 표 갱신. 누락된 모델은 estimatedCostUsd undefined.
 */
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'claude-sonnet-4-6': { input: 3, output: 15 },
  'claude-opus-4-7': { input: 15, output: 75 },
  'claude-haiku-4-5': { input: 0.8, output: 4 },
  'claude-haiku-4-5-20251001': { input: 0.8, output: 4 },
};

function estimateCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number | undefined {
  const pricing = MODEL_PRICING[model];
  if (!pricing) return undefined;
  return (
    (inputTokens / 1_000_000) * pricing.input
    + (outputTokens / 1_000_000) * pricing.output
  );
}

interface AnthropicResponseBody {
  id: string;
  type: 'message';
  role: 'assistant';
  content: Array<{ type: 'text'; text: string } | { type: string }>;
  model: string;
  stop_reason: string | null;
  usage?: { input_tokens: number; output_tokens: number };
}

function extractText(content: AnthropicResponseBody['content']): string {
  return content
    .filter((block): block is { type: 'text'; text: string } => block.type === 'text')
    .map((block) => block.text)
    .join('');
}

export async function callClaude(input: CallClaudeInput): Promise<LlmCallResult> {
  const {
    apiKey,
    system,
    user,
    model = DEFAULT_MODEL,
    maxTokens = DEFAULT_MAX_TOKENS,
    temperature = DEFAULT_TEMPERATURE,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    baseUrl = DEFAULT_BASE_URL,
    anthropicVersion = DEFAULT_ANTHROPIC_VERSION,
    fetch: fetchImpl = globalThis.fetch,
  } = input;

  if (!apiKey) {
    throw new LlmCallError('auth', 'apiKey is required');
  }

  const startedAt = Date.now();
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetchImpl(`${baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': anthropicVersion,
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        temperature,
        system,
        messages: [{ role: 'user', content: user }],
      }),
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new LlmCallError('timeout', `LLM call exceeded ${timeoutMs}ms`, err);
    }
    throw new LlmCallError('network', 'fetch failed', err);
  } finally {
    clearTimeout(timeoutHandle);
  }

  const latencyMs = Date.now() - startedAt;

  if (response.status === 401 || response.status === 403) {
    throw new LlmCallError('auth', `auth failed (${response.status})`);
  }
  if (response.status === 429) {
    throw new LlmCallError('rate_limit', 'rate limited (429)');
  }
  if (response.status >= 500) {
    throw new LlmCallError('server_error', `server error ${response.status}`);
  }
  if (!response.ok) {
    throw new LlmCallError(
      'invalid_response',
      `unexpected status ${response.status}`,
    );
  }

  let body: AnthropicResponseBody;
  try {
    body = (await response.json()) as AnthropicResponseBody;
  } catch (err) {
    throw new LlmCallError('invalid_response', 'response not JSON', err);
  }

  if (body.type !== 'message' || !Array.isArray(body.content)) {
    throw new LlmCallError(
      'invalid_response',
      `unexpected response shape (type=${body.type})`,
    );
  }

  const text = extractText(body.content);
  const inputTokens = body.usage?.input_tokens ?? 0;
  const outputTokens = body.usage?.output_tokens ?? 0;
  const estimatedCostUsd = estimateCost(body.model, inputTokens, outputTokens);

  return {
    text,
    usage: {
      inputTokens,
      outputTokens,
      ...(estimatedCostUsd !== undefined ? { estimatedCostUsd } : {}),
    },
    latencyMs,
    model: body.model,
    stopReason: body.stop_reason,
  };
}

/** 모델별 단가 표 노출 — 운영 도구에서 budget 계산 시 참조. */
export function getModelPricing(): typeof MODEL_PRICING {
  return MODEL_PRICING;
}
