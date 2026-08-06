'use client';

import { useLocale, useTranslations } from 'next-intl';
import { usePathname, useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { controlClass } from '@/shared/ui/control-class';

const STORAGE_KEY = 'ontology-atlas:locale';
const LOCALES = [
  { code: 'en', label: 'EN', nameKey: 'english' },
  { code: 'ko', label: 'KO', nameKey: 'korean' },
] as const;

export interface LocaleSwitchProps {
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
 * Compact two-button locale toggle. Persists choice in localStorage so the
 * root `/` redirect picks it up next visit. Replaces `/<old>/...` with
 * `/<new>/...` while preserving query/hash task state — no full reload needed.
 */
export function LocaleSwitch({ onSwitchStart }: LocaleSwitchProps = {}) {
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
    <div
      role="group"
      aria-label={t('switcher')}
      className="inline-flex items-center gap-px rounded-chip border border-[color:var(--color-border-soft)] bg-[color:var(--color-elevated)] p-px text-label"
    >
      {LOCALES.map(({ code, label, nameKey }) => {
        const active = code === locale;
        return (
          <button
            key={code}
            type="button"
            onClick={() => switchTo(code)}
            disabled={isPending}
            aria-pressed={active}
            aria-label={`${label} ${t(nameKey)}`}
            className={
              // coarse 포인터에서 히트만 44px — 시각 크기(32px)는 그대로다.
              // 이 토글은 관문(/download) 상단 GNB 에도 서므로 터치 계약을 탄다.
              controlClass({
                shape: 'segment',
                size: 'md',
                tone: active ? 'default' : 'muted',
                className:
                  'touch-hit-expand h-8 min-w-8 px-2 font-[var(--font-weight-signature)] ' +
                  (active ? 'bg-[color:var(--color-panel)]' : 'hover:text-[color:var(--color-text-secondary)]'),
              })
            }
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
