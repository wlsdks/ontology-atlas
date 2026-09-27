/** Where the three vendors take one form; Rust only handles secrets, transport and auditing. */

import type { AgentJsonSchema, AgentToolDefinition } from './tool-catalog';

/** One tool result executed in a round trip. It is carried into the next round trip back to the model. */
export interface ToolResultPayload {
  /** The tool call id the vendor gave (or the executor synthesized). */
  id: string;
  name: string;
  /** The serialized result, or an error sentence. */
  content: string;
  isError: boolean;
}

/** One assistant turn plus the tool results for it. */
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
  /** The user's own words. */
  userText: string;
  /** The screen context block — carried alongside the first user message. */
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
  /** The assistant turn verbatim, to be sent back in the next round trip. */
  raw: unknown;
  /** The one line the screen uses when `stop === 'error' | 'refusal'`. */
  errorMessage?: string;
}

type ProviderResponseReview =
  | { action: 'accept' }
  | { action: 'retry' | 'fail'; expectedTool: string; message: string };

export interface ProviderAdapter {
  readonly provider: string;
  /** This vendor's default model. */
  readonly defaultModel: string;
  buildBody(turn: TurnAssembly): string;
  parseResponse(body: string): NormalizedResponse;
  /** Optional provider-specific enforcement after parsing, before accepting text. */
  reviewResponse?(turn: TurnAssembly, response: NormalizedResponse): ProviderResponseReview;
}

/** Per-vendor defaults with no picker; a retired name fails visibly rather than switching models. */
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
