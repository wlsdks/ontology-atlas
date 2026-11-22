import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import {
  GatewayDocPage,
  GUIDE_ENTRY_PAGE,
  guideChapterMeta,
  readGuideDocument,
} from '@/views/gateway-doc';
import { buildPageMetadata } from '@/shared/lib/public-pages/page-metadata';
import { JsonLd } from '@/shared/ui';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'metadata' });
  const base = buildPageMetadata({
    locale,
    path: 'guide',
    title: t('pages.guide'),
    description: t('descriptions.guide'),
  });
  const chapter = await guideChapterMeta(GUIDE_ENTRY_PAGE, locale, readGuideDocument(GUIDE_ENTRY_PAGE, locale).sourcePath);
  return {
    ...base,
    openGraph: {
      ...base.openGraph,
      type: 'article',
      ...(chapter.datePublished ? { publishedTime: chapter.datePublished } : {}),
      ...(chapter.dateModified ? { modifiedTime: chapter.dateModified } : {}),
    },
  };
}

/** Renders the first chapter in place: a redirect would change the shared address. */
export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'gatewayNav' });
  const document = readGuideDocument(GUIDE_ENTRY_PAGE, locale);
  const chapter = await guideChapterMeta(GUIDE_ENTRY_PAGE, locale, document.sourcePath);

  return (
    <>
      <JsonLd data={chapter.structuredData.article} />
      <JsonLd data={chapter.structuredData.breadcrumb} />
      <GatewayDocPage
        document={document}
        title={t(`guidePages.${GUIDE_ENTRY_PAGE.titleKey}`)}
        lead={t('guideLead')}
        sourcePath={document.sourcePath}
        sidebar
        activeSegment={GUIDE_ENTRY_PAGE.segment}
        {...(chapter.updated ? { updated: chapter.updated } : {})}
      />
    </>
  );
}
