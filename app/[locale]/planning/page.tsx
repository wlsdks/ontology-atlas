import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { buildPageMetadata } from '@/shared/lib/public-pages/page-metadata';
import { PlanningPage } from '@/views/planning';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'planning' });
  return buildPageMetadata({ locale, path: 'planning', title: t('title'), description: t('chooseBody') });
}
export default function Page() { return <PlanningPage />; }
