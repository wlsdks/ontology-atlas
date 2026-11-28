import { useLocale, useTranslations } from 'use-intl';
import { useTransition } from 'react';
import { LOCALE_NAME_KEY } from '@/i18n/locales';
import { usePathname, useRouter } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';
import { SegmentedControl } from '@/shared/ui/fields/segmented-control';

const STORAGE_KEY = 'ontology-atlas:locale';

export interface LocaleSwitchProps {
  locales?: readonly string[];
  onSwitchStart?: (nextLocale: string) => void;
}

/** Persists the choice in localStorage so the root `/` redirect picks it up next visit. */
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
    /* Raw from `window.location`, so duplicate keys, order and encoding survive a language-only switch byte for byte. */
    const target = `${pathname}${window.location.search}${window.location.hash}`;
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
