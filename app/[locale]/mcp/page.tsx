import { Suspense } from 'react';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { McpRedirectPage } from '@/views/mcp-redirect';
import { RouteLoadingFallback } from '@/shared/ui';
import { absoluteUrl } from '@/shared/config';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'mcp' });
  // A redirect, not a destination (2026-09-17): the canonical address is the Agents
  // destination that now holds the MCP tab, so search engines see one page, not two.
  return { title: t('title'), alternates: { canonical: absoluteUrl(`/${locale}/agents/`) } };
}

/**
 * `/mcp` — redirects into `/agents/?tab=mcp`, carrying its section and every other parameter,
 * so older links and the installed app's `ontology-atlas://mcp?install=…` deep link still land.
 *
 * The `Suspense` boundary is required: the view reads the query through `useSearchParams`, and
 * with `output: 'export'` a prerendered page without one fails the build.
 */
export default function Page() {
  return (
    <Suspense fallback={<RouteLoadingFallback />}>
      <McpRedirectPage />
    </Suspense>
  );
}
