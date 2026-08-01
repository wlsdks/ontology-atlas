/**
 * 벤더 3사를 하나의 모양으로 맞추는 자리.
 *
 * Rust 는 요청을 만들지도 응답을 해석하지도 않는다 — 비밀 취급·전송·감사만
 * 한다. 벤더 형식 차이는 **여기 한 곳**에서 흡수한다. 그래야 벤더가 바뀌어도
 * 앱을 다시 빌드하지 않아도 되는 자리와, 다시 빌드해야 하는 자리가 갈린다.
 */

import type { AgentJsonSchema, AgentToolDefinition } from './tool-catalog';

/** 한 왕복에서 실행한 도구 결과 하나. 다음 왕복에 실려 모델에게 돌아간다. */
export interface ToolResultPayload {
  /** 벤더가 준(또는 실행기가 합성한) tool call id. */
  id: string;
  name: string;
  /** 직렬화된 결과 또는 오류 문장. */
  content: string;
  isError: boolean;
}

/** assistant 턴 하나 + 그에 대한 도구 결과들. */
export interface WireExchange {
  /**
   * 벤더 응답의 assistant 턴 **원문**. 그대로 되돌려 보낸다 — 특히
   * Anthropic 의 thinking 블록은 편집하면 다음 왕복이 거절된다.
   */
  assistant: unknown;
  toolResults: ToolResultPayload[];
  /**
   * A provider ignored a required tool call. The next request preserves that
   * assistant turn, then sends one deterministic correction instead of silently
   * accepting an evidence-free answer.
   */
  retry?: { expectedTool: string; instruction: string };
}

export interface TurnAssembly {
  model: string;
  /** 1층 제품 규율 + (있으면) 2층 프로젝트 지침. */
  system: string;
  /** 사용자 본인의 말. */
  userText: string;
  /** 화면 문맥 블록 — 첫 사용자 메시지에 함께 실린다. */
  screenContextBlock: string;
  exchanges: WireExchange[];
  tools: readonly AgentToolDefinition[];
}

export interface NormalizedToolCall {
  id: string;
  name: string;
  /** 파싱에 성공했을 때만 값이 있다. 실패하면 `argsInvalid` 가 true. */
  args: unknown;
  argsInvalid: boolean;
}

export type NormalizedStop = 'end' | 'tool' | 'length' | 'refusal' | 'error' | 'other';

export interface NormalizedResponse {
  text: string;
  toolCalls: NormalizedToolCall[];
  stop: NormalizedStop;
  /** 다음 왕복에 되돌려 보낼 assistant 턴 원문. */
  raw: unknown;
  /** `stop === 'error' | 'refusal'` 일 때 화면이 쓸 한 줄. */
  errorMessage?: string;
}

export type ProviderResponseReview =
  | { action: 'accept' }
  | { action: 'retry' | 'fail'; expectedTool: string; message: string };

export interface ProviderAdapter {
  readonly provider: string;
  /** 이 벤더의 기본 모델. */
  readonly defaultModel: string;
  buildBody(turn: TurnAssembly): string;
  parseResponse(body: string): NormalizedResponse;
  /** Optional provider-specific enforcement after parsing, before accepting text. */
  reviewResponse?(turn: TurnAssembly, response: NormalizedResponse): ProviderResponseReview;
}

/**
 * 벤더별 기본 모델 — 사용자가 고르지 않는다(모델 피커는 만들지 않는다).
 *
 * 벤더가 이 이름을 은퇴시키면 첫 왕복이 실패하고, 화면은 벤더가 준 문장을
 * 모델 이름과 함께 그대로 보여준다. 조용히 다른 모델로 갈아타지 않는다 —
 * 사용자가 어떤 모델에 자기 데이터를 보냈는지 아는 것이 헌장이다.
 */
export const PROVIDER_DEFAULT_MODELS: Record<string, string> = {
  anthropic: 'claude-opus-5',
  openai: 'gpt-5.1',
  gemini: 'gemini-2.5-pro',
};

/** JSON 본문에서 사람이 읽을 오류 한 줄을 꺼낸다. 없으면 상태 코드로 강등. */
export function readVendorErrorMessage(parsed: unknown): string | undefined {
  const root = parsed as { error?: unknown } | null;
  const error = root?.error;
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object') {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message) return message;
  }
  return undefined;
}

/**
 * Gemini 의 functionDeclarations 는 OpenAPI 부분집합만 받는다. 모르는 키가
 * 섞이면 요청 전체가 400 이 되므로 허용 키만 남긴다.
 */
const GEMINI_ALLOWED_SCHEMA_KEYS = [
  'type',
  'description',
  'enum',
  'properties',
  'required',
  'items',
  'maxItems',
] as const;

export function toGeminiSchema(schema: AgentJsonSchema): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of GEMINI_ALLOWED_SCHEMA_KEYS) {
    const value = schema[key as keyof AgentJsonSchema];
    if (value === undefined) continue;
    if (key === 'properties') {
      const props: Record<string, unknown> = {};
      for (const [name, child] of Object.entries(value as Record<string, AgentJsonSchema>)) {
        props[name] = toGeminiSchema(child);
      }
      out.properties = props;
    } else if (key === 'items') {
      out.items = toGeminiSchema(value as AgentJsonSchema);
    } else {
      out[key] = value;
    }
  }
  return out;
}

/** 인자가 없는 도구는 `parameters` 자체를 빼야 Gemini 가 받는다. */
export function hasParameters(schema: AgentJsonSchema): boolean {
  return Object.keys(schema.properties ?? {}).length > 0;
}
