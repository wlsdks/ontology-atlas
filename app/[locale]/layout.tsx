import { hasLocale, NextIntlClientProvider } from 'next-intl';
import { getMessages, getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { AppShell, MotionProvider } from '@/app-providers/providers';
import { TaxonomyProvider } from '@/features/taxonomy';
import { LocalVaultProvider } from '@/features/docs-vault-local';
import { OntologyLiveBaselineInit } from '@/features/vault-ontology';
import { BottomTabBar } from '@/widgets/bottom-tab-bar';
import { ToastProvider, TooltipProvider } from '@/shared/ui';
import { routing } from '@/i18n/routing';
import { LocaleHtmlLang } from '@/shared/ui/locale-html-lang';
import { RouteMemory } from '@/shared/ui/route-memory';

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'metadata' });

  return {
    title: {
      default: t('siteName'),
      // absolute: true means root layout's template is NOT prepended; this
      // locale layout owns the title template now.
      template: `%s · ${t('siteName')}`,
    },
    description: t('siteTagline'),
    /**
     * ⚠️ **hreflang is not given here — each page gives its own.**
     *
     * This layout used to pin `{en: '/en/', ko: '/ko/', 'x-default': '/en/'}`. A layout is the
     * parent of every route, so **every page advertised "my English counterpart is the site home"** —
     * `/ko/docs/`'s counterpart is `/en/docs/`, yet it pointed at `/en/` (measured 2026-07-29: 7 of
     * 9 indexable pages shipped with that signal).
     *
     * hreflang is a **per-path fact**, so only something that knows the path can state it.
     * `buildPageMetadata` in `@/shared/lib/page-metadata` assembles the canonical, the locale pair,
     * and `x-default` in one place. Saying nothing here is better than passing down something wrong —
     * for routes absent from the sitemap (`/project/new`, `/git`) having no hreflang at all is correct.
     */
  };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  setRequestLocale(locale);

  const messages = await getMessages();

  const tNav = await getTranslations({ locale, namespace: 'nav' });

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <LocaleHtmlLang locale={locale} />
      {/* Skip-to-content link — locale-aware copy. Originally lived in
          app/layout.tsx as hardcoded Korean; moved here so it's translated. */}
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[var(--z-skip-link)] focus:rounded-[var(--radius-chip)] focus:border focus:border-[color:var(--color-indigo-a50)] focus:bg-[color:var(--color-panel)] focus:px-3 focus:py-2 focus:text-body focus:text-[color:var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[color:var(--color-indigo-focus-ring)]"
      >
        {tNav('skipToContent')}
      </a>
      <MotionProvider>
        <TaxonomyProvider>
          {/* `LocalVaultProvider` is the single source of truth. Consumers share one instance through
              `useLocalVault()` — this fixed the eight independent call sites producing two or three
              duplicate instances. */}
          <LocalVaultProvider>
            {/* The notification region's name is **supplied by the app** — a primitive that reads
                translations itself becomes this app's rather than portable (2026-08-15). */}
            <ToastProvider notificationsLabel={tNav('notificationsAriaLabel')}>
              <TooltipProvider delayDuration={300}>
                {/* Sets the change baseline once when a local vault loads, so agent edits pulse on
                    the topology without a click. Headless. */}
                <OntologyLiveBaselineInit />
                <RouteMemory />
                <AppShell>{children}</AppShell>
                <BottomTabBar />
              </TooltipProvider>
            </ToastProvider>
          </LocalVaultProvider>
        </TaxonomyProvider>
      </MotionProvider>
    </NextIntlClientProvider>
  );
}
