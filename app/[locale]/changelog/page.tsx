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
    path: 'changelog',
    title: t('pages.changelog'),
    description: t('descriptions.changelog'),
  });
}

/**
 * 그릴 절의 수.
 *
 * CHANGELOG 는 오늘 **318KB** 이고 계속 자란다. 전문을 한 페이지에 풀면 관문의
 * 읽을거리가 제품에서 가장 무거운 화면이 된다. 이 문서를 여는 사람이 찾는 것은
 * **최근에 무엇이 바뀌었나**이지 전체 역사가 아니다 — 전체가 필요한 사람은
 * 저장소 원문으로 보내고, 화면이 몇 개를 접었는지 먼저 말한다.
 *
 * 12 는 이 저장소의 최근 속도로 **대략 2~3주치**다. 값을 바꿀 이유가 생기면
 * "몇 개"가 아니라 "몇 주치를 보여줄 것인가"로 정한다.
 */
const RECENT_SECTIONS = 12;

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'gatewayNav' });

  return (
    <GatewayDocPage
      slug="CHANGELOG"
      title={t('changelogTitle')}
      lead={t('changelogLead')}
      recentSectionLimit={RECENT_SECTIONS}
      sourcePath="docs/CHANGELOG.md"
    />
  );
}
