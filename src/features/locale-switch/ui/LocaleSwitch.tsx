'use client';

import { useLocale, useTranslations } from 'next-intl';
import { usePathname, useRouter } from 'next/navigation';
import { useTransition } from 'react';

const STORAGE_KEY = 'omot:locale';
const LOCALES = [
  { code: 'en', label: 'EN' },
  { code: 'ko', label: 'KO' },
] as const;

/**
 * Compact two-button locale toggle. Persists choice in localStorage so the
 * root `/` redirect picks it up next visit. Replaces `/<old>/...` with
 * `/<new>/...` in the current URL — no full reload needed.
 */
export function LocaleSwitch() {
  const t = useTranslations('locale');
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function switchTo(next: string) {
    if (next === locale) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // localStorage unavailable — proceed without persistence
    }
    const segments = pathname.split('/');
    if (segments[1] === locale) {
      segments[1] = next;
    } else {
      segments.splice(1, 0, next);
    }
    const target = segments.join('/') || `/${next}/`;
    startTransition(() => {
      router.replace(target);
    });
  }

  return (
    <div
      role="group"
      aria-label={t('switcher')}
      className="inline-flex items-center gap-px rounded-md border border-[color:var(--color-border-soft)] bg-[color:var(--color-elevated)] p-px text-[11px]"
    >
      {LOCALES.map(({ code, label }) => {
        const active = code === locale;
        return (
          <button
            key={code}
            type="button"
            onClick={() => switchTo(code)}
            disabled={isPending}
            aria-pressed={active}
            className={
              'rounded-[4px] px-2 py-1 font-medium transition-colors ' +
              (active
                ? 'bg-[color:var(--color-panel)] text-[color:var(--color-text-primary)]'
                : 'text-[color:var(--color-text-tertiary)] hover:text-[color:var(--color-text-secondary)]')
            }
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
