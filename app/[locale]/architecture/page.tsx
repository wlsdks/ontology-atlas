import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { ArchitecturePage } from '@/views/architecture';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'architecture' });
  return { title: t('title'), description: t('description') };
}

export default function Page() {
  return <ArchitecturePage />;
}
