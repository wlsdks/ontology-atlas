import { Suspense } from 'react';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { McpRedirectPage } from '@/views/mcp-redirect';
import { RouteLoadingFallback } from '@/shared/ui';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'mcp' });
  // A redirect into the Agents workbench, which itself is noindex: nothing here to index or canonicalize.
  return { title: t('title'), robots: { index: false, follow: true } };
}

/**
 * Carries every parameter into `/agents/?tab=mcp`, so the installed app's
 * `ontology-atlas://mcp?install=…` deep link still lands. The `Suspense` boundary is required:
 * with `output: 'export'`, a prerendered page calling `useSearchParams` without one fails the build.
 */
export default function Page() {
  return (
    <Suspense fallback={<RouteLoadingFallback />}>
      <McpRedirectPage />
    </Suspense>
  );
}
