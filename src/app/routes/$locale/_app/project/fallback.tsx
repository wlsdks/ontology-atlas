import { createFileRoute } from '@tanstack/react-router';
import { Suspense } from 'react';
import { ProjectFallbackClient } from '@/app/[locale]/project/fallback/ProjectFallbackClient';
import { RouteLoadingFallback } from '@/shared/ui';
import { PageTitle } from '@/app-providers/router/PageTitle';

export const Route = createFileRoute('/$locale/_app/project/fallback')({ component: ProjectFallbackRoute });

function ProjectFallbackRoute() {
  return (
    <>
      <PageTitle namespace="projectPages" messageKey="detail.topBarProjectsLabel" />
      <Suspense fallback={<RouteLoadingFallback />}><ProjectFallbackClient /></Suspense>
    </>
  );
}
