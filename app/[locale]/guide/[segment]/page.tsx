import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { GatewayDocPage, GUIDE_PAGES, GUIDE_ENTRY_PAGE, resolveGuidePage } from '@/views/gateway-doc';
import { buildPageMetadata } from '@/shared/lib/page-metadata';
import { routing } from '@/i18n/routing';

/**
 * 정적 export 라 경로를 전부 미리 만든다 — 목록의 단일 진실원이 `GUIDE_PAGES` 다.
 * 장을 하나 더하면 라우트·사이드바·이전다음이 **한 곳에서** 같이 늘어난다.
 */
export function generateStaticParams() {
  return routing.locales.flatMap((locale) =>
    GUIDE_PAGES.map((page) => ({ locale, segment: page.segment })),
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; segment: string }>;
}): Promise<Metadata> {
  const { locale, segment } = await params;
  const { page } = resolveGuidePage(segment);
  const tNav = await getTranslations({ locale, namespace: 'gatewayNav' });
  const t = await getTranslations({ locale, namespace: 'metadata' });
  return buildPageMetadata({
    locale,
    path: `guide/${page.segment}`,
    title: `${tNav(`guidePages.${page.titleKey}`)} · ${t('pages.guide')}`,
    description: t('descriptions.guide'),
  });
}

export default async function Page({
  params,
}: {
  params: Promise<{ locale: string; segment: string }>;
}) {
  const { locale, segment } = await params;
  const { page, matched } = resolveGuidePage(segment);
  const t = await getTranslations({ locale, namespace: 'gatewayNav' });

  return (
    <GatewayDocPage
      slug={page.slug}
      title={t(`guidePages.${page.titleKey}`)}
      {...(page.segment === GUIDE_ENTRY_PAGE.segment ? { lead: t('guideLead') } : {})}
      /*
       * 모르는 세그먼트에는 첫 장을 그리되 **대체했다고 말한다** — 말없는
       * 폴백은 그 주소의 문서인 척하는 오배송이다(2026-08-14 걷기 실측:
       * 본문의 상대 `.md` 링크가 여기로 떨어져 1장이 명세 행세를 했다).
       */
      {...(matched ? {} : { notice: t('guideUnknownSegment') })}
      sourcePath={`docs/${page.slug}.md`}
      sidebar
      activeSegment={page.segment}
    />
  );
}
