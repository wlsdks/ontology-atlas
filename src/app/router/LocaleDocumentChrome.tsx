import { useTranslations } from 'use-intl';

import { LocaleHtmlLang } from '@/shared/ui/document/locale-html-lang';

/** Keeps `<html lang>` equal to the route's language and gives the skip link its first tab stop. */
export function LocaleDocumentChrome({ locale }: { locale: string }) {
  const t = useTranslations('nav');
  return (
    <>
      <LocaleHtmlLang locale={locale} />
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[var(--z-skip-link)] focus:rounded-[var(--radius-chip)] focus:border focus:border-[color:var(--color-indigo-focus-ring)] focus:bg-[color:var(--color-panel)] focus:px-3 focus:py-2 focus:text-body focus:text-[color:var(--color-text-primary)] focus:outline-hidden focus:ring-2 focus:ring-[color:var(--color-indigo-focus-ring)]"
      >
        {t('skipToContent')}
      </a>
    </>
  );
}
