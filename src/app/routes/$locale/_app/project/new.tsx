import { createFileRoute } from '@tanstack/react-router';
import { Suspense } from 'react';
import { ProjectNewClientPage } from '@/app/[locale]/project/new/ProjectNewClientPage';
import { RouteLoadingFallback } from '@/shared/ui';
import { PageTitle } from '@/app-providers/router/PageTitle';

export const Route = createFileRoute('/$locale/_app/project/new')({ component: ProjectNewRoute });

function ProjectNewRoute() {
  return (
    <>
      <PageTitle namespace="metadata" messageKey="pages.projectNew" />
      <Suspense fallback={<RouteLoadingFallback />}><ProjectNewClientPage /></Suspense>
    </>
  );
}
