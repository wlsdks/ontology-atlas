import { createFileRoute } from '@tanstack/react-router';
import { Suspense } from 'react';
import { HarnessPage } from '@/views/architecture';
import { RouteLoadingFallback } from '@/shared/ui';
import { PageTitle } from '@/app-providers/router/PageTitle';

export const Route = createFileRoute('/$locale/_app/architecture')({ component: ArchitectureRoute });

function ArchitectureRoute() {
  return (
    <>
      <PageTitle namespace="harness" messageKey="title" />
      <Suspense fallback={<RouteLoadingFallback />}><HarnessPage /></Suspense>
    </>
  );
}
