import type { ProviderAdapter } from '../provider-adapter';
import { anthropicAdapter } from './anthropic';
import { geminiAdapter } from './gemini';
import { openaiAdapter } from './openai';

/**
 * 명명 벤더 3사 전부 — 키 등록이 3사로 출하돼 있는데 대화가 2사면 화면이
 * 자기를 반박한다. 목록은 `secrets.rs` 의 허용목록과 같은 순서다.
 */
export const PROVIDER_ADAPTERS: Record<string, ProviderAdapter> = {
  anthropic: anthropicAdapter,
  openai: openaiAdapter,
  gemini: geminiAdapter,
};

export function resolveProviderAdapter(provider: string): ProviderAdapter | null {
  return PROVIDER_ADAPTERS[provider] ?? null;
}

export { anthropicAdapter, openaiAdapter, geminiAdapter };
