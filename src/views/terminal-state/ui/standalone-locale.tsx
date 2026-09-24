'use client';

import { useEffect, useSyncExternalStore, type ReactNode } from 'react';
import { NextIntlClientProvider } from 'next-intl';
import koMessages from '@/messages/ko.json';
import enMessages from '@/messages/en.json';
import { isDesktopShell } from '@/shared/lib/desktop-shell';

/**
 * Locale for the screens that render **outside** `app/[locale]/layout.tsx`.
 *
 * The root `not-found.tsx` serves every unresolved path under `output: 'export'`, and the root
 * `error.tsx` replaces the locale layout when a render throws, so neither has the intl provider.
 * The locale comes from the URL's first segment (`/ko/…` → ko) and the message JSON is imported
 * directly. The provider is mounted here so the shared screens (and the gateway nav on the 404)
 * read messages the ordinary way instead of through a second, hand-rolled lookup.
 *
 * `<html lang>` is set from the same answer: the root layout writes `en`, and a Korean 404 read
 * aloud in an English voice was the measured defect (2026-09-25).
 */
const LOCALE_MESSAGES = { ko: koMessages, en: enMessages } as const;
export type StandaloneLocale = keyof typeof LOCALE_MESSAGES;

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

export function StandaloneLocaleProvider({ children }: { children: ReactNode }) {
  const locale = useStandaloneLocale();
  useEffect(() => {
    const root = document.documentElement;
    const previous = root.lang;
    root.lang = locale;
    return () => {
      root.lang = previous;
    };
  }, [locale]);
  return (
    <NextIntlClientProvider locale={locale} messages={LOCALE_MESSAGES[locale]}>
      {children}
    </NextIntlClientProvider>
  );
}
