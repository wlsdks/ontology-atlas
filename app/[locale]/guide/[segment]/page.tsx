import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { GatewayDocPage, GUIDE_PAGES, GUIDE_ENTRY_PAGE, resolveGuidePage } from '@/views/gateway-doc';
import { buildPageMetadata } from '@/shared/lib/page-metadata';
import { routing } from '@/i18n/routing';

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
       * An unknown segment renders the first chapter but **says it substituted** — a silent fallback
       * is a misdelivery pretending to be that address's document (measured in a 2026-08-14
       * walkthrough: relative `.md` links in the body landed here and chapter 1 masqueraded as the
       * specification).
       */
      {...(matched ? {} : { notice: t('guideUnknownSegment') })}
      sourcePath={`docs/${page.slug}.md`}
      sidebar
      activeSegment={page.segment}
    />
  );
}
