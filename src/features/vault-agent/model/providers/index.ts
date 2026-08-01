import type { ProviderAdapter } from '../provider-adapter';
import { anthropicAdapter } from './anthropic';
import { geminiAdapter } from './gemini';
import { localAdapter } from './local';
import { openaiAdapter } from './openai';

/**
 * 명명 벤더 3사 + 주소로 연결하는 한 갈래 — 키 등록이 3사로 출하돼 있는데
 * 대화가 2사면 화면이 자기를 반박한다. 앞 셋의 순서는 `secrets.rs` 의
 * 허용목록과 같고, `local` 은 그 목록에 **없다**(보관할 키가 없어서다).
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
