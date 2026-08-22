import type { ConnectionProvider } from '@/shared/lib/tauri-secrets';

/**
 * i18n keys for vendor labels — the settings sheet's summary chip and the
 * [AI 연결] subview must use the **same name**.
 *
 * A ternary (`provider === 'anthropic' ? … : …`) leaves one of the two screens
 * unfixed every time a vendor is added, so the summary chip ends up holding the
 * old name. A record makes the type report the missing entry first.
 */
export const AI_PROVIDER_LABEL_KEY: Record<ConnectionProvider, string> = {
  anthropic: 'providerAnthropic',
  openai: 'providerOpenai',
  gemini: 'providerGemini',
  // The fourth row is not a vendor but a **category** — the user types an address
  // here, so naming it after a single vendor (say "Ollama") makes the screen lie
  // to someone who connected LM Studio.
  local: 'providerLocal',
};
