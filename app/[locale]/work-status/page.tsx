import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { WorkStatusPage } from '@/views/work-status';
import { buildPageMetadata } from '@/shared/lib/public-pages/page-metadata';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'workStatus' });
  return buildPageMetadata({ locale, path: 'work-status', title: t('title'), description: t('web.body'), noindex: true });
}
export default function Page() { return <WorkStatusPage />; }
