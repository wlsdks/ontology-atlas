import { createFileRoute } from '@tanstack/react-router';
import { Suspense } from 'react';
import { AgentsWorkspace } from '@/app-providers/agents-workspace';
import { RouteLoadingFallback } from '@/shared/ui';
import { PageTitle } from '@/app-providers/router/PageTitle';

export const Route = createFileRoute('/$locale/_app/agents')({ component: AgentsRoute });

function AgentsRoute() {
  return (
    <>
      <PageTitle namespace="agents" messageKey="title" />
      <Suspense fallback={<RouteLoadingFallback />}><AgentsWorkspace /></Suspense>
    </>
  );
}
