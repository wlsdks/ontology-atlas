import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { DownloadPage, downloadStructuredData } from '@/views/download';
import { buildPageMetadata } from '@/shared/lib/public-pages/page-metadata';
import { JsonLd } from '@/shared/ui';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'metadata' });
  return buildPageMetadata({
    locale,
    path: 'download',
    title: t('homeTitle'),
    description: t('descriptions.home'),
    absoluteTitle: true,
  });
}

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'metadata' });

  return (
    <>
      <DownloadPage />
      {/*
       * ⚠️ **This comes after the page root, not before it.**
       *
       * `tests/e2e/design-audits/scroll-end-gap.spec.ts` measures on the premise that the shell body slot's
       * `firstElementChild` is the page root. Putting this `<script>` first makes it that first
       * child, and being zero-height the gate correctly reports "the page root is collapsed
       * (box 0 < content 1589)" — measured: CI failed at two viewport widths.
       *
       * The spec's assumption is right: the slot's first child is the page. So a non-visual
       * sibling stands after it. JSON-LD is read by search engines wherever it sits in the
       * document, so the ordering costs nothing.
       */}
      <JsonLd data={downloadStructuredData(locale, t('descriptions.download'))} />
    </>
  );
}
