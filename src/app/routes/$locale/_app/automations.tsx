import { createFileRoute } from '@tanstack/react-router';
import { Suspense } from 'react';
import { AutomationsWorkspace } from '@/app-providers/automations-workspace';
import { RouteLoadingFallback } from '@/shared/ui';
import { PageTitle } from '@/app-providers/router/PageTitle';

export const Route = createFileRoute('/$locale/_app/automations')({ component: AutomationsRoute });

function AutomationsRoute() {
  return (
    <>
      <PageTitle namespace="automations" messageKey="title" />
      <Suspense fallback={<RouteLoadingFallback />}><AutomationsWorkspace /></Suspense>
    </>
  );
}
