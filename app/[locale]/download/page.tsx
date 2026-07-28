import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { DownloadPage, downloadStructuredData } from '@/views/download';
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
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            downloadStructuredData(locale, t('descriptions.download')),
          ),
        }}
      />
      <DownloadPage />
    </>
  );
}
