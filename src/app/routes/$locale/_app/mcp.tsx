import { createFileRoute } from '@tanstack/react-router';
import { Suspense } from 'react';
import { McpRedirectPage } from '@/views/mcp-redirect';
import { RouteLoadingFallback } from '@/shared/ui';
import { PageTitle } from '@/app-providers/router/PageTitle';

export const Route = createFileRoute('/$locale/_app/mcp')({ component: McpRoute });

function McpRoute() {
  return (
    <>
      <PageTitle namespace="mcp" messageKey="title" />
      <Suspense fallback={<RouteLoadingFallback />}><McpRedirectPage /></Suspense>
    </>
  );
}
