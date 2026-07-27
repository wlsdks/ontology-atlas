import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { DownloadPage } from '@/views/download';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'metadata' });
  return { title: t('pages.download') };
}

export default function Page() {
  // The owner-only first-release checklist (blocked-on-PR/secrets/tag status
  // plus a copyable CI audit command) was removed for the public launch: it
  // spoke about the build pipeline, not about whether a visitor can install
  // the app. What the page may claim now derives from whether a release is
  // actually published — see `views/download/lib/release-state.ts`. The
  // release runbook in `docs/DESKTOP-MACOS.md` owns the operator checklist.
  return <DownloadPage />;
}
