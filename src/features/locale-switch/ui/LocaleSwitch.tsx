'use client';

import { useLocale, useTranslations } from 'next-intl';
import { usePathname, useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { LOCALE_NAME_KEY } from '@/i18n/locales';
import { routing } from '@/i18n/routing';
import { SegmentedControl } from '@/shared/ui/segmented-control';

const STORAGE_KEY = 'ontology-atlas:locale';

export interface LocaleSwitchProps {
  locales?: readonly string[];
  /**
   * Runs before navigation starts. Hosts that unmount across locale segments
   * can record a focus-return intent without coupling this feature to them.
   */
  onSwitchStart?: (nextLocale: string) => void;
}

/**
 * Replace only the locale path segment. `rawSearch` and `rawHash` come
 * directly from `window.location` so duplicate keys, ordering, and their
 * original encoding survive a language-only transition byte-for-byte.
 */
export function buildLocaleTarget(
  pathname: string,
  currentLocale: string,
  nextLocale: string,
  rawSearch = '',
  rawHash = '',
): string {
  const segments = pathname.split('/');
  if (segments[1] === currentLocale) {
    segments[1] = nextLocale;
  } else {
    segments.splice(1, 0, nextLocale);
  }
  const localizedPath = segments.join('/') || `/${nextLocale}/`;
  return `${localizedPath}${rawSearch}${rawHash}`;
}

/**
 * Compact locale toggle. Persists choice in localStorage so the
 * root `/` redirect picks it up next visit. Replaces `/<old>/...` with
 * `/<new>/...` while preserving query/hash task state — no full reload needed.
 */
export function LocaleSwitch({ onSwitchStart, locales = routing.locales }: LocaleSwitchProps = {}) {
  const t = useTranslations('locale');
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function switchTo(next: string) {
    if (next === locale) return;
    onSwitchStart?.(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // localStorage unavailable — proceed without persistence
    }
    const target = buildLocaleTarget(
      pathname,
      locale,
      next,
      window.location.search,
      window.location.hash,
    );
    startTransition(() => {
      router.replace(target, { scroll: false });
    });
  }

  return (
    <SegmentedControl
      ariaLabel={t('switcher')}
      value={locale}
      busy={isPending}
      onChange={(next) => switchTo(next)}
      options={locales.flatMap((code) => {
        const nameKey = (LOCALE_NAME_KEY as Record<string, string>)[code];
        if (!nameKey || !t.has(nameKey)) return [];
        const label = code.toUpperCase();
        return [{ value: code, label, ariaLabel: `${label} ${t(nameKey)}` }];
      })}
    />
  );
}
