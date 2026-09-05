import { Suspense } from 'react';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { McpPage } from '@/views/mcp';
import { RouteLoadingFallback } from '@/shared/ui';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'mcp' });
  return { title: t('title') };
}

/**
 * `/mcp` — everything MCP: the folder's own server on one tab, the external connectors on the
 * other.
 *
 * ⚠️ **The `Suspense` boundary is required, not decorative.** The view reads `?tab=` through
 * `useSearchParams`, and with `output: 'export'` a prerendered page that calls it without a
 * boundary fails the build outright ("useSearchParams() should be wrapped in a suspense
 * boundary"). `/ontology/insights` carries the same wrapper for the same reason, and this file
 * copies it rather than inventing a second answer.
 */
export default function Page() {
  return (
    <Suspense fallback={<RouteLoadingFallback />}>
      <McpPage />
    </Suspense>
  );
}
