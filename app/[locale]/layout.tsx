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
     * ⚠️ **hreflang 은 여기서 주지 않는다 — 페이지가 자기 것을 준다.**
     *
     * 예전엔 이 레이아웃이 `{en: '/en/', ko: '/ko/', 'x-default': '/en/'}` 를
     * 박아 뒀다. 레이아웃은 모든 라우트의 부모라, 그 결과 **모든 페이지가
     * "내 영어판은 사이트 홈이다"라고 광고**했다 — `/ko/docs/` 의 짝은
     * `/en/docs/` 인데 `/en/` 을 가리켰다(2026-07-29 실측: 색인 대상 9개 중
     * 7개가 이 신호를 달고 배포돼 있었다).
     *
     * hreflang 은 **경로별 사실**이므로 경로를 아는 쪽만 말할 수 있다.
     * `@/shared/lib/page-metadata` 의 `buildPageMetadata` 가 canonical ·
     * 로케일 짝 · `x-default` 를 한 곳에서 조립한다. 여기서 아무 말도 하지
     * 않는 편이 틀린 말을 물려주는 것보다 낫다 — 사이트맵에 없는 라우트
     * (`/project/new` · `/git` 등)는 hreflang 이 아예 없는 게 정답이다.
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
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[var(--z-skip-link)] focus:rounded-[var(--radius-chip)] focus:border focus:border-[color:var(--color-indigo-a50)] focus:bg-[color:var(--color-panel)] focus:px-3 focus:py-2 focus:text-body focus:text-[color:var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[color:var(--color-indigo-a46)]"
      >
        {tNav('skipToContent')}
      </a>
      <MotionProvider>
        <TaxonomyProvider>
          {/* LocalVaultProvider 가 single source of truth.
              consumer 는 useLocalVault() 로 동일 instance 공유 — Round 7
              에서 발견한 8 곳 독립 호출 → 2-3 인스턴스 중복 fix. */}
          <LocalVaultProvider>
            {/* 알림 영역 이름은 **앱이 넣는다** — 프리미티브가 번역을 직접
                읽으면 그 부품은 이 앱의 것이 된다(2026-08-15 이식성 슬라이스). */}
            <ToastProvider notificationsLabel={tNav('notificationsAriaLabel')}>
              <TooltipProvider delayDuration={300}>
                {/* live-web — 로컬 vault 로드 시 변경 baseline 자동 1회.
                    이후 에이전트 편집이 클릭 없이 토폴로지에 pulse. 헤드리스. */}
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
