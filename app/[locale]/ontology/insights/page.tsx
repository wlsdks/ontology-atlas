import { Suspense } from 'react';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { InsightsRedirectPage } from '@/views/insights-redirect';
import { RouteLoadingFallback } from '@/shared/ui';
import { absoluteUrl } from '@/shared/config';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'metadata' });
  // Canonical is the map so search engines see one page.
  return { title: t('pages.ontology'), alternates: { canonical: absoluteUrl(`/${locale}/topology/`) } };
}

/**
 * `/ontology/insights` — the retired Analysis address, kept so saved links and the installed
 * app's remembered route still land: `tab=harness` on Harness, `tab=library` on the Wiki, a named
 * concept selected on the map, anything else on the map.
 *
 * The `Suspense` boundary is required: the view reads the query through `useSearchParams`, and
 * with `output: 'export'` a prerendered page without one fails the build.
 */
export default function Page() {
  return (
    <Suspense fallback={<RouteLoadingFallback />}>
      <InsightsRedirectPage />
    </Suspense>
  );
}
