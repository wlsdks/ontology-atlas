import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { GatewayDocPage } from '@/views/gateway-doc';
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

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'gatewayNav' });

  /*
   * 가이드는 **자르지 않는다** — 통째로 읽는 글이고, 절 수가 저절로 자라지도
   * 않는다. `recentSectionLimit` 은 계속 자라는 CHANGELOG 전용이다.
   */
  return (
    <GatewayDocPage
      slug="GUIDE"
      title={t('guideTitle')}
      lead={t('guideLead')}
      sourcePath="docs/GUIDE.md"
    />
  );
}
