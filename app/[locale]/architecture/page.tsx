import { Suspense } from 'react';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { buildPageMetadata } from '@/shared/lib/public-pages/page-metadata';

import { HarnessPage } from '@/views/architecture';
import { RouteLoadingFallback } from '@/shared/ui';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'harness' });
  return buildPageMetadata({
    locale,
    path: 'architecture',
    title: t('title'),
    description: t('explainer'),
    noindex: true,
  });
}

/**
 * The route name stays so saved links and `?focus=` deep links still land here. The `Suspense`
 * boundary is required: with `output: 'export'`, a prerendered page calling `useSearchParams`
 * without one fails the build.
 */
export default function Page() {
  return (
    <Suspense fallback={<RouteLoadingFallback />}>
      <HarnessPage search={{}} />
    </Suspense>
  );
}
