import { Suspense } from 'react';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { AgentsWorkspace } from '@/app-providers/agents-workspace';
import { RouteLoadingFallback } from '@/shared/ui';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'agents' });
  return { title: t('title') };
}

/**
 * `/agents` — the coding tools on this computer on one tab, and everything MCP on the other
 * (2026-09-17). The workspace reads `?tab=` through `useSearchParams`, which needs this
 * `Suspense` boundary under `output: 'export'`.
 */
export default function Page() {
  return (
    <Suspense fallback={<RouteLoadingFallback />}>
      <AgentsWorkspace />
    </Suspense>
  );
}
