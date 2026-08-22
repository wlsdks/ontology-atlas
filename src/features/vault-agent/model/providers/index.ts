import type { ProviderAdapter } from '../provider-adapter';
import { anthropicAdapter } from './anthropic';
import { geminiAdapter } from './gemini';
import { localAdapter } from './local';
import { openaiAdapter } from './openai';

/**
 * Three named vendors plus the one connect-by-address branch — shipping key
 * registration for three vendors while the conversation supports two makes the screen
 * contradict itself. The first three follow the order of the allowlist in
 * `secrets.rs`, and `local` is **not** on that list (there is no key to store).
 */
export const PROVIDER_ADAPTERS: Record<string, ProviderAdapter> = {
  anthropic: anthropicAdapter,
  openai: openaiAdapter,
  gemini: geminiAdapter,
  local: localAdapter,
};

export function resolveProviderAdapter(provider: string): ProviderAdapter | null {
  return PROVIDER_ADAPTERS[provider] ?? null;
}

export { anthropicAdapter, openaiAdapter, geminiAdapter, localAdapter };
