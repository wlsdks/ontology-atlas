import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { DownloadPage, downloadStructuredData } from '@/views/download';
import { buildPageMetadata } from '@/shared/lib/page-metadata';
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
    title: t('pages.download'),
    description: t('descriptions.download'),
  });
}

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'metadata' });

  // The owner-only first-release checklist (blocked-on-PR/secrets/tag status
  // plus a copyable CI audit command) was removed for the public launch: it
  // spoke about the build pipeline, not about whether a visitor can install
  // the app. What the page may claim now derives from whether a release is
  // actually published — see `views/download/lib/release-state.ts`. The
  // release runbook in `docs/DESKTOP-MACOS.md` owns the operator checklist.
  return (
    <>
      <DownloadPage />
      {/*
       * ⚠️ **This comes after the page root, not before it.**
       *
       * `tests/e2e/scroll-end-gap.spec.ts` measures on the premise that the shell body slot's
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
