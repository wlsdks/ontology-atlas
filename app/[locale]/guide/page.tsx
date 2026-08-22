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
 * `/guide` — **renders the first chapter in place rather than redirecting.**
 *
 * `/guide` is a shared address, and a redirect that changes the URL leaves whoever received the link
 * unsure what they clicked. The table of contents on the left already says which chapter this is.
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
