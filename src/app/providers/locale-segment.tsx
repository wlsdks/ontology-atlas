import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { routing } from '@/i18n/routing';
import type { AppLocale } from '@/i18n/locales';
import { LocaleHtmlLang } from '@/shared/ui/document/locale-html-lang';

export function localeStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function localeLayoutMetadata(locale: string): Promise<Metadata> {
  const t = await getTranslations({ locale, namespace: 'metadata' });
  return {
    title: {
      default: t('siteName'),
      // The root layout's template is not prepended; the locale layout owns the title template.
      template: `%s · ${t('siteName')}`,
    },
    description: t('siteTagline'),
    // Words people type in this language; Google ignores the tag, Bing, Naver and Baidu read it.
    keywords: t('keywords').split(/\s*[,，、]\s*/),
    // hreflang is a per-path fact, so each page sets it through `buildPageMetadata`.
  };
}

export function enterLocaleSegment(locale: string): AppLocale {
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  return locale;
}

export async function LocaleDocumentChrome({ locale }: { locale: AppLocale }) {
  const tNav = await getTranslations({ locale, namespace: 'nav' });
  return (
    <>
      <LocaleHtmlLang locale={locale} />
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[var(--z-skip-link)] focus:rounded-[var(--radius-chip)] focus:border focus:border-[color:var(--color-indigo-focus-ring)] focus:bg-[color:var(--color-panel)] focus:px-3 focus:py-2 focus:text-body focus:text-[color:var(--color-text-primary)] focus:outline-hidden focus:ring-2 focus:ring-[color:var(--color-indigo-focus-ring)]"
      >
        {tNav('skipToContent')}
      </a>
    </>
  );
}
