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
 * How many sections to render.
 *
 * The CHANGELOG is **318 KB** today and keeps growing. Unrolling all of it on one page makes the
 * gateway's reading material the heaviest screen in the product. What someone opening this document
 * wants is **what changed recently**, not the whole history — anyone who needs all of it is sent to
 * the repository, and the screen says up front how many it folded.
 *
 * 12 is roughly **two to three weeks** at this repository's recent pace. If the value needs to
 * change, decide it as "how many weeks to show", not "how many entries".
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
      entryNav
      sourcePath="docs/CHANGELOG.md"
    />
  );
}
