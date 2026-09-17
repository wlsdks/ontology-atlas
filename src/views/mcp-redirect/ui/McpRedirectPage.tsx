'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect } from 'react';

import { useRouter } from '@/i18n/navigation';
import { RouteLoadingFallback } from '@/shared/ui';

/**
 * `/mcp` — a redirect, not a destination, since 2026-09-17.
 *
 * MCP became the second tab of Agents. Every address that used to land here still has a
 * home: `/mcp/` → `/agents/?tab=mcp`, `/mcp/?tab=connectors` → `/agents/?tab=mcp&mcp=connectors`,
 * and every other parameter travels unchanged — which is what keeps the installed app's
 * one inbound link (`ontology-atlas://mcp?install=…`, answered by Rust as
 * `/<locale>/mcp/?tab=connectors&install=…`) reaching the connectors dialog it was
 * written for. The Rust side is untouched on purpose: the address it emits is public.
 *
 * `replace`, not `push`: a person pressing Back must not return to a page whose only act
 * is to send them forward again.
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
