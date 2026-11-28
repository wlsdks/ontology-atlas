import { useSyncExternalStore } from 'react';
import type { AppLocale } from '@/i18n/locales';

/**
 * The workbench's whole message catalog, fetched as one chunk per locale instead of riding in the
 * page's HTML, where a first-time visitor who sees only the gateway would
 * pay for about 420 KB of it. Every workbench route waits for this chunk, which the browser caches across pages.
 *
 * Dynamic imports only: a static import would put all four locales into every page's JavaScript
 * (`standalone-messages-server-only.contract.test.ts`).
 */
export type MessageCatalog = Record<string, unknown>;

type SettledPromise = Promise<MessageCatalog> & { status?: 'fulfilled'; value?: MessageCatalog };

const loaded = new Map<AppLocale, MessageCatalog>();
const pending = new Map<AppLocale, SettledPromise>();
const listeners = new Set<() => void>();

function importCatalog(locale: AppLocale): Promise<{ default: MessageCatalog }> {
  // One literal per locale, so the bundler emits one chunk each and nothing else.
  switch (locale) {
    case 'ko':
      return import('@/messages/ko.json');
    case 'ja':
      return import('@/messages/ja.json');
    case 'zh':
      return import('@/messages/zh.json');
    default:
      return import('@/messages/en.json');
  }
}

/** Starts the fetch once per locale; every caller gets the same promise, which `use()` needs. */
export function loadWorkbenchCatalog(locale: AppLocale): Promise<MessageCatalog> {
  const inFlight = pending.get(locale);
  if (inFlight) return inFlight;
  const promise: SettledPromise = importCatalog(locale).then((module) => {
    loaded.set(locale, module.default);
    // The fields React's `use` reads to take a settled promise without suspending.
    promise.status = 'fulfilled';
    promise.value = module.default;
    listeners.forEach((listener) => listener());
    return module.default;
  });
  // Lets a retry start over after a failed fetch instead of replaying the rejection.
  promise.catch(() => pending.delete(locale));
  pending.set(locale, promise);
  return promise;
}

export function readWorkbenchCatalog(locale: AppLocale): MessageCatalog | null {
  return loaded.get(locale) ?? null;
}

export function subscribeWorkbenchCatalog(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const serverSnapshot = () => null;

/**
 * The loaded catalog, or null until it arrives. Null on the server and during hydration, so the
 * first client render reads what the server rendered.
 */
export function useWorkbenchCatalog(locale: AppLocale): MessageCatalog | null {
  return useSyncExternalStore(subscribeWorkbenchCatalog, () => readWorkbenchCatalog(locale), serverSnapshot);
}
