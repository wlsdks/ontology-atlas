import type { AppLocale } from '@/i18n/locales';

/**
 * The shape of the words a screen outside the workbench's providers carries (the 404 and the error
 * boundary): a few namespaces per language, imported from the namespace files by
 * `route-error-messages.ts` and `not-found-messages.ts`. A whole-language file would put every
 * catalogue into those pages; `tests/contract/messages/standalone-messages-server-only.contract.test.ts`
 * refuses it.
 */
export type StandaloneLocale = AppLocale;
export type StandaloneMessages = Record<StandaloneLocale, Record<string, unknown>>;
