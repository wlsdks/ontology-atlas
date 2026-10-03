import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { buildPageMetadata } from '@/shared/lib/page-metadata';
import { GitPage } from '@/views/git';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'atlasGit' });
  const tMeta = await getTranslations({ locale, namespace: 'metadata' });
  return buildPageMetadata({
    locale,
    path: 'git',
    title: t('title'),
    description: tMeta('descriptions.git'),
  });
}

export default function Page() {
  return <GitPage />;
}
