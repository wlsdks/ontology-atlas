import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { ChangeBriefingPage } from '@/views/change-briefing';
import { buildPageMetadata } from '@/shared/lib/public-pages/page-metadata';

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'changeBriefing' });
  return buildPageMetadata({ locale, path: 'changes', title: t('title'), description: t('intro') });
}
export default function Page() { return <ChangeBriefingPage />; }
