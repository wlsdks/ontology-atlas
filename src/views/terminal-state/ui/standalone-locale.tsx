'use client';

import { createContext, useContext, useEffect, useSyncExternalStore, type ReactNode } from 'react';
import { NextIntlClientProvider } from 'next-intl';
import { isDesktopShell } from '@/shared/lib/desktop-shell';
import type { StandaloneLocale, StandaloneMessages } from '@/i18n/standalone-messages';

/**
 * Locale for the screens that render **outside** `app/[locale]/layout.tsx`.
 *
 * The root `not-found.tsx` serves every unresolved path under `output: 'export'`, and the root
 * `error.tsx` replaces the locale layout when a render throws, so neither has the intl provider.
 * The locale comes from the URL's first segment (`/ko/…` → ko). The provider is mounted here so
 * the shared screens (and the gateway nav on the 404) read messages the ordinary way instead of
 * through a second, hand-rolled lookup.
 *
 * **The messages arrive as props from a server component**, never as a JSON import here: this
 * module is in the root layout's client tree, and importing the two message files put about
 * 836 KB of JSON into every page's JavaScript (`@/i18n/standalone-messages`).
 *
 * `<html lang>` is set from the same answer: the root layout writes `en`, and a Korean 404 read
 * aloud in an English voice was the measured defect (2026-09-25).
 */
export type { StandaloneLocale };

const subscribeStatic = () => () => undefined;

function detectLocale(): StandaloneLocale {
  if (typeof window === 'undefined') return 'en';
  return window.location.pathname.split('/')[1] === 'ko' ? 'ko' : 'en';
}

export function useStandaloneLocale(): StandaloneLocale {
  return useSyncExternalStore<StandaloneLocale>(subscribeStatic, detectLocale, () => 'en');
}

/** Whether this is the installed app, where a vault is the home and there is no gateway. */
export function useIsDesktopShell(): boolean {
  return useSyncExternalStore<boolean>(subscribeStatic, isDesktopShell, () => false);
}

/**
 * Whether the client answers (locale, surface) are in.
 *
 * The static export prerenders the root 404 once, with no URL and no shell, so the server
 * snapshots above say `en` and "web". Drawing that HTML showed a Korean visitor English first,
 * and in the installed app it painted the gateway nav and reading links for a frame before they
 * vanished. The screens stay an empty canvas until this is true, then enter once, already right.
 * A client navigation mounts with the client snapshot, so there is no blank frame there.
 */
export function useClientAnswered(): boolean {
  return useSyncExternalStore<boolean>(subscribeStatic, () => true, () => false);
}

/**
 * The messages a server component picked for these screens. The root layout provides the
 * error boundary's copy to every page; the root 404 passes its own set as a prop.
 */
const StandaloneMessagesContext = createContext<StandaloneMessages | null>(null);

export function StandaloneMessagesProvider({
  messages,
  children,
}: {
  messages: StandaloneMessages;
  children: ReactNode;
}) {
  return (
    <StandaloneMessagesContext.Provider value={messages}>{children}</StandaloneMessagesContext.Provider>
  );
}

export function StandaloneLocaleProvider({
  messages,
  children,
}: {
  messages?: StandaloneMessages;
  children: ReactNode;
}) {
  const locale = useStandaloneLocale();
  const provided = useContext(StandaloneMessagesContext);
  const bundle = messages ?? provided;
  useEffect(() => {
    const root = document.documentElement;
    const previous = root.lang;
    root.lang = locale;
    return () => {
      root.lang = previous;
    };
  }, [locale]);
  return (
    <NextIntlClientProvider locale={locale} messages={bundle?.[locale] ?? {}}>
      {children}
    </NextIntlClientProvider>
  );
}
