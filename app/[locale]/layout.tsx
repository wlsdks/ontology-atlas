import { hasLocale, NextIntlClientProvider } from 'next-intl';
import { getMessages, getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { MotionProvider } from '@/app-providers/providers';
import { TaxonomyProvider } from '@/features/taxonomy';
import { LocalVaultProvider } from '@/features/docs-vault-local';
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
      // hreflang map — `next.config.ts` 의 `trailingSlash: true` 와 정합되게
      // 모든 path 에 trailing slash. `x-default` 는 언어 미지정 사용자에게
      // 어느 locale 을 기본 노출할지 Google 에 hint (en).
      languages: {
        en: '/en/',
        ko: '/ko/',
        'x-default': '/en/',
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

  const tNav = await getTranslations({ locale, namespace: 'nav' });

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <LocaleHtmlLang locale={locale} />
      {/* Skip-to-content link — locale-aware copy. Originally lived in
          app/layout.tsx as hardcoded Korean; moved here so it's translated. */}
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-md focus:border focus:border-[color:rgba(113,112,255,0.5)] focus:bg-[color:var(--color-panel)] focus:px-3 focus:py-2 focus:text-[13px] focus:text-[color:var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[color:rgba(94,106,210,0.46)]"
      >
        {tNav('skipToContent')}
      </a>
      <MotionProvider>
        <TaxonomyProvider>
          {/* LocalVaultProvider 가 single source of truth.
              consumer 는 useLocalVault() 로 동일 instance 공유 — Round 7
              에서 발견한 8 곳 독립 호출 → 2-3 인스턴스 중복 fix. */}
          <LocalVaultProvider>
            <ToastProvider>
              <TooltipProvider delayDuration={300}>
                {children}
                <BottomTabBar />
              </TooltipProvider>
            </ToastProvider>
          </LocalVaultProvider>
        </TaxonomyProvider>
      </MotionProvider>
    </NextIntlClientProvider>
  );
}
