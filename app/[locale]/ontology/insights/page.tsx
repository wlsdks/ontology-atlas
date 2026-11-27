import { Suspense } from 'react';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { InsightsRedirectPage } from '@/views/insights-redirect';
import { RouteLoadingFallback } from '@/shared/ui';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'metadata' });
  return { title: t('pages.ontology'), robots: { index: false, follow: true } };
}

/**
 * Kept so saved links and the installed app's remembered route still land. The `Suspense` boundary
 * is required: with `output: 'export'`, a prerendered page calling `useSearchParams` without one
 * fails the build.
 */
export default function Page() {
  return (
    <Suspense fallback={<RouteLoadingFallback />}>
      <InsightsRedirectPage />
    </Suspense>
  );
}
