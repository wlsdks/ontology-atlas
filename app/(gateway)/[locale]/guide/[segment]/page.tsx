import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import {
  GatewayDocPage,
  GUIDE_PAGES,
  GUIDE_ENTRY_PAGE,
  guideCanonicalPath,
  guideChapterMeta,
  readGuideDocument,
  resolveGuidePage,
} from '@/views/gateway-doc';
import { buildPageMetadata } from '@/shared/lib/public-pages/page-metadata';
import { routing } from '@/i18n/routing';
import { JsonLd } from '@/shared/ui';

/**
 * Static export means every path is generated ahead of time, and the single source for the list is
 * `GUIDE_PAGES`. Adding a chapter grows the routes, the sidebar, and prev/next **from one place**.
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
  const t = await getTranslations({ locale, namespace: 'metadata' });
  const chapter = await guideChapterMeta(page, locale, readGuideDocument(page, locale).sourcePath);
  const base = buildPageMetadata({
    locale,
    path: guideCanonicalPath(page),
    title: `${chapter.headline} · ${t('pages.guide')}`,
    description: chapter.description,
  });
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

export default async function Page({
  params,
}: {
  params: Promise<{ locale: string; segment: string }>;
}) {
  const { locale, segment } = await params;
  const { page, matched } = resolveGuidePage(segment);
  const t = await getTranslations({ locale, namespace: 'gatewayNav' });
  const document = readGuideDocument(page, locale);
  const chapter = await guideChapterMeta(page, locale, document.sourcePath);

  return (
    <>
      {/* A substituted chapter is not this address's article, so it claims none. */}
      {matched ? <JsonLd data={chapter.structuredData.article} /> : null}
      {matched ? <JsonLd data={chapter.structuredData.breadcrumb} /> : null}
      <GatewayDocPage
        document={document}
        title={t(`guidePages.${page.titleKey}`)}
        {...(page.segment === GUIDE_ENTRY_PAGE.segment ? { lead: t('guideLead') } : {})}
        /*
         * An unknown segment renders the first chapter but says it substituted; a silent fallback would
         * pass as that address's document.
         */
        {...(matched ? {} : { notice: t('guideUnknownSegment') })}
        sourcePath={document.sourcePath}
        sidebar
        activeSegment={page.segment}
        {...(chapter.updated ? { updated: chapter.updated } : {})}
      />
    </>
  );
}
