import type { ProviderAdapter } from '../provider-adapter';
import { anthropicAdapter } from './anthropic';
import { geminiAdapter } from './gemini';
import { localAdapter } from './local';
import { openaiAdapter } from './openai';

/** Three named vendors in `secrets.rs` allowlist order, plus the keyless connect-by-address branch. */
export const PROVIDER_ADAPTERS: Record<string, ProviderAdapter> = {
  anthropic: anthropicAdapter,
  openai: openaiAdapter,
  gemini: geminiAdapter,
  local: localAdapter,
};

export function resolveProviderAdapter(provider: string): ProviderAdapter | null {
  return PROVIDER_ADAPTERS[provider] ?? null;
}
