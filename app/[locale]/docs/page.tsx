import { Suspense } from 'react';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { DocsVaultPage } from '@/views/docs-vault';
import { RouteLoadingFallback } from '@/shared/ui';
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
    path: 'docs',
    title: t('pages.docs'),
    description: t('descriptions.docs'),
  });
}

export default function Page() {
  return (
    <Suspense fallback={<RouteLoadingFallback />}>
      <DocsVaultPage />
    </Suspense>
  );
}
