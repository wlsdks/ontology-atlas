import { hasLocale, NextIntlClientProvider } from 'next-intl';
import { getMessages, getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { AppShell, MotionProvider } from '@/app-providers/providers';
import { TaxonomyProvider } from '@/features/taxonomy';
import { LocalVaultProvider } from '@/entities/vault-session';
import { OntologyLiveBaselineInit } from '@/features/vault-ontology';
import { BottomTabBar } from '@/widgets/bottom-tab-bar';
import { ToastProvider, TooltipProvider } from '@/shared/ui';
import { routing } from '@/i18n/routing';
import { LocaleHtmlLang } from '@/shared/ui/document/locale-html-lang';
import { RouteMemory } from '@/shared/ui/routing/route-memory';

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
     * hreflang is a per-path fact, so each page sets it through `buildPageMetadata`; a layout-level
     * value would be wrong for every child route.
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
            {/* The notification region's name is supplied by the app so the primitive does not read
               translations itself. */}
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
