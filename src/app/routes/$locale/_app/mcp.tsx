import { createFileRoute } from '@tanstack/react-router';
import { Suspense } from 'react';
import { McpRedirectPage } from '@/views/mcp-redirect';
import { RouteLoadingFallback } from '@/shared/ui';
import { ScreenTitle } from '../../-site/ScreenTitle';
import type { ScreenHead } from '../../-site/screen-metadata';

const head: ScreenHead = {
  kind: 'title-only',
  title: { namespace: 'mcp', key: 'title' },
  follow: true,
};

export const Route = createFileRoute('/$locale/_app/mcp')({ staticData: { head }, component: McpRoute });

function McpRoute() {
  return (
    <>
      <ScreenTitle head={head} />
      <Suspense fallback={<RouteLoadingFallback />}><McpRedirectPage /></Suspense>
    </>
  );
}
