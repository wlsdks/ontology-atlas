'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect } from 'react';

import { useRouter } from '@/i18n/navigation';
import { RouteLoadingFallback } from '@/shared/ui';

/**
 * Other parameters travel unchanged, or the app's public deep link
 * (`ontology-atlas://mcp?install=…`) no longer reaches the connectors dialog.
 */
export function buildMcpRedirectHref(search: URLSearchParams): string {
  const query = new URLSearchParams();
  query.set('tab', 'mcp');
  const section = search.get('tab');
  if (section && section !== 'share') query.set('mcp', section);
  for (const [key, value] of search.entries()) {
    if (key === 'tab' || key === 'mcp') continue;
    query.append(key, value);
  }
  return `/agents/?${query.toString()}`;
}

export function McpRedirectPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const target = buildMcpRedirectHref(new URLSearchParams(searchParams.toString()));

  useEffect(() => {
    router.replace(target);
  }, [router, target]);

  return <RouteLoadingFallback />;
}
