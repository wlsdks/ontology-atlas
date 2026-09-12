import { Suspense } from 'react';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { HarnessPage } from '@/views/architecture';
import { RouteLoadingFallback } from '@/shared/ui';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'harness' });
  return { title: t('title'), description: t('explainer') };
}

/**
 * `/architecture` — the Harness destination. The route name is unchanged on purpose: every link,
 * bookmark and `?focus=` deep link written before the tab was renamed still lands here, and
 * `?view=` defaults to the blueprint those links meant.
 *
 * ⚠️ **The `Suspense` boundary is required, not decorative.** The view reads `?view=` through
 * `useSearchParams`, and with `output: 'export'` a prerendered page that calls it without a
 * boundary fails the build outright. `/mcp` and `/ontology/insights` carry the same wrapper for the
 * same reason; this file copies them rather than inventing a third answer.
 */
export default function Page() {
  return (
    <Suspense fallback={<RouteLoadingFallback />}>
      <HarnessPage />
    </Suspense>
  );
}
