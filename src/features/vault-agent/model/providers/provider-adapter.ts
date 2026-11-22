/** Where the three vendors take one form; Rust only handles secrets, transport and auditing. */

import type { AgentJsonSchema, AgentToolDefinition } from '../agent-tools/tool-catalog';

export interface ToolResultPayload {
  id: string;
  name: string;
  content: string;
  isError: boolean;
}

export interface WireExchange {
  /** The vendor's assistant turn verbatim; editing Anthropic's thinking blocks gets the next round trip rejected. */
  assistant: unknown;
  toolResults: ToolResultPayload[];
  /** A required tool call was ignored: resend that turn with one deterministic correction. */
  retry?: { expectedTool: string; instruction: string };
}

export interface TurnAssembly {
  model: string;
  /** Layer-1 product discipline plus layer-2 project instructions when present. */
  system: string;
  userText: string;
  screenContextBlock: string;
  exchanges: WireExchange[];
  tools: readonly AgentToolDefinition[];
}

export interface NormalizedToolCall {
  id: string;
  name: string;
  /** Only set when parsing succeeded. On failure `argsInvalid` is true. */
  args: unknown;
  argsInvalid: boolean;
}

export type NormalizedStop = 'end' | 'tool' | 'length' | 'refusal' | 'error' | 'other';

export interface NormalizedResponse {
  text: string;
  toolCalls: NormalizedToolCall[];
  stop: NormalizedStop;
  raw: unknown;
  /** The one line the screen uses when `stop === 'error' | 'refusal'`. */
  errorMessage?: string;
}

type ProviderResponseReview =
  | { action: 'accept' }
  | { action: 'retry' | 'fail'; expectedTool: string; message: string };

export interface ProviderAdapter {
  readonly provider: string;
  readonly defaultModel: string;
  buildBody(turn: TurnAssembly): string;
  parseResponse(body: string): NormalizedResponse;
  /** Optional provider-specific enforcement after parsing, before accepting text. */
  reviewResponse?(turn: TurnAssembly, response: NormalizedResponse): ProviderResponseReview;
}

/** A retired model name fails visibly rather than switching models. */
export const PROVIDER_DEFAULT_MODELS: Record<string, string> = {
  anthropic: 'claude-opus-5',
  openai: 'gpt-5.1',
  gemini: 'gemini-2.5-pro',
};

/** Extracts a human-readable error line from the JSON body, degrading to the status code when absent. */
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

/** Gemini rejects the whole request on an unknown schema key, so only these survive. */
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

/** A tool with no arguments must omit `parameters` entirely for Gemini to accept it. */
export function hasParameters(schema: AgentJsonSchema): boolean {
  return Object.keys(schema.properties ?? {}).length > 0;
}
