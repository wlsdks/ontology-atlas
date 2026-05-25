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
  const showFirstReleaseChecklist = process.env.NEXT_PUBLIC_OMOT_FIRST_RELEASE_PENDING !== '0';

  return <DownloadPage showFirstReleaseChecklist={showFirstReleaseChecklist} />;
}
