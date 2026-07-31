import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { GatewayDocPage, GUIDE_ENTRY_PAGE } from '@/views/gateway-doc';
import { buildPageMetadata } from '@/shared/lib/page-metadata';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'metadata' });
  return buildPageMetadata({
    locale,
    path: 'guide',
    title: t('pages.guide'),
    description: t('descriptions.guide'),
  });
}

/**
 * `/guide` — **리다이렉트하지 않고 첫 장을 그 자리에서 그린다.**
 *
 * `/guide` 는 공유되는 주소인데 리다이렉트로 URL 이 바뀌면 링크를 받은 사람이
 * 자기가 뭘 눌렀는지 모르게 된다. 왼쪽 차례가 어느 장인지 이미 말해 준다.
 */
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'gatewayNav' });

  return (
    <GatewayDocPage
      slug={GUIDE_ENTRY_PAGE.slug}
      title={t(`guidePages.${GUIDE_ENTRY_PAGE.titleKey}`)}
      lead={t('guideLead')}
      sourcePath={`docs/${GUIDE_ENTRY_PAGE.slug}.md`}
      sidebar
      activeSegment={GUIDE_ENTRY_PAGE.segment}
    />
  );
}
