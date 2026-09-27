import type { ConnectionProvider } from '@/shared/lib/tauri-secrets';

/**
 * i18n keys for vendor labels, shared so every screen uses the same name; a record makes
 * the type report a missing entry when a vendor is added.
 */
export const AI_PROVIDER_LABEL_KEY: Record<ConnectionProvider, string> = {
  anthropic: 'providerAnthropic',
  openai: 'providerOpenai',
  gemini: 'providerGemini',
  // A category, not a vendor: the user types any runner's address here.
  local: 'providerLocal',
};
