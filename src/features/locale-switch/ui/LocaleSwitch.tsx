import { useLocale, useTranslations } from 'use-intl';
import { useTransition } from 'react';
import { LOCALE_NAME_KEY } from '@/i18n/locales';
import { useRouter as useTanStackRouter } from '@tanstack/react-router';
import { useRouter } from '@/i18n/navigation';
import { withoutLocale } from '@/i18n/locale-address';
import { routing } from '@/i18n/routing';
import { SegmentedControl } from '@/shared/ui/fields/segmented-control';

const STORAGE_KEY = 'ontology-atlas:locale';

/** The one router call this switch makes. The router's types cannot name "the screen this switch sits in", which `to: '.'` means. */
interface ScreenAddresses {
  buildLocation(options: {
    to: '.';
    params: (previous: Record<string, unknown>) => Record<string, unknown>;
    search: true;
    hash: true;
  }): { href: string };
}

export interface LocaleSwitchProps {
  locales?: readonly string[];
  onSwitchStart?: (nextLocale: string) => void;
}

/** Persists the choice in localStorage so the root `/` redirect picks it up next visit. */
export function LocaleSwitch({ onSwitchStart, locales = routing.locales }: LocaleSwitchProps = {}) {
  const t = useTranslations('locale');
  const locale = useLocale();
  const router = useRouter();
  const addresses = useTanStackRouter() as unknown as ScreenAddresses;
  const [isPending, startTransition] = useTransition();

  function switchTo(next: string) {
    if (next === locale) return;
    onSwitchStart?.(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // localStorage unavailable — proceed without persistence
    }
    // The router's own address for the same screen in the other language: `search` and `hash` carry over as written.
    const { href } = addresses.buildLocation({
      to: '.',
      params: (previous: Record<string, unknown>) => ({ ...previous, locale: next }),
      search: true,
      hash: true,
    });
    const target = withoutLocale(href);
    startTransition(() => {
      router.replace(target, { locale: next, scroll: false });
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
