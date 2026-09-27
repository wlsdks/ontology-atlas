'use client';

import { createContext, useContext, useEffect, useSyncExternalStore, type ReactNode } from 'react';
import { NextIntlClientProvider } from 'next-intl';
import { isDesktopShell } from '@/shared/lib/desktop-shell';
import type { StandaloneLocale, StandaloneMessages } from '@/i18n/standalone-messages';

/**
 * Locale from the URL's first segment for the root 404 and error screens, which render outside
 * the locale layout; it also sets `<html lang>`. Messages arrive as props from a server component,
 * or the message files ship in every page's JavaScript (`@/i18n/standalone-messages`).
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

export function useIsDesktopShell(): boolean {
  return useSyncExternalStore<boolean>(subscribeStatic, isDesktopShell, () => false);
}

/**
 * The prerendered 404 says `en` and "web", so screens stay blank until locale and surface are
 * known client-side, then enter once, already right.
 */
export function useClientAnswered(): boolean {
  return useSyncExternalStore<boolean>(subscribeStatic, () => true, () => false);
}

/** Picked by a server component: the root layout for the error boundary, the root 404 for itself. */
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
