import { hasLocale, NextIntlClientProvider } from 'next-intl';
import { getMessages, getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { MotionProvider } from '@/app-providers/providers';
import '@/shared/lib/firestore-noise-patch';
import { TaxonomyProvider } from '@/features/taxonomy';
import { BottomTabBar } from '@/widgets/bottom-tab-bar';
import { ToastProvider, TooltipProvider } from '@/shared/ui';
import { routing } from '@/i18n/routing';
import { LocaleHtmlLang } from '@/shared/ui/locale-html-lang';

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
    alternates: {
      languages: {
        en: '/en',
        ko: '/ko',
      },
    },
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

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <LocaleHtmlLang locale={locale} />
      <MotionProvider>
        <TaxonomyProvider>
          <ToastProvider>
            <TooltipProvider delayDuration={300}>
              {children}
              <BottomTabBar />
            </TooltipProvider>
          </ToastProvider>
        </TaxonomyProvider>
      </MotionProvider>
    </NextIntlClientProvider>
  );
}
