import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { CHANGELOG_CONTENT_LOCALES, GatewayDocPage } from '@/views/gateway-doc';
import { readGatewayDocument } from '@/views/build-time-readers';
import { buildPageMetadata } from '@/shared/lib/public-pages/page-metadata';

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
    contentLocales: CHANGELOG_CONTENT_LOCALES,
  });
}

/** The whole CHANGELOG would be the heaviest screen; 12 sections is two to three weeks, so tune it in weeks. */
const RECENT_SECTIONS = 12;

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'gatewayNav' });

  return (
    <GatewayDocPage
      document={readGatewayDocument('CHANGELOG')}
      title={t('changelogTitle')}
      lead={t('changelogLead')}
      recentSectionLimit={RECENT_SECTIONS}
      entryNav
      sourcePath="docs/CHANGELOG.md"
    />
  );
}
