import { createFileRoute } from '@tanstack/react-router';
import { Suspense } from 'react';
import { ProjectSelectorPage } from '@/views/project-selector';
import { RouteLoadingFallback } from '@/shared/ui';
import { PageTitle } from '@/app-providers/router/PageTitle';

export const Route = createFileRoute('/$locale/_app/projects')({ component: ProjectsRoute });

function ProjectsRoute() {
  return (
    <>
      <PageTitle namespace="metadata" messageKey="pages.projects" />
      <Suspense fallback={<RouteLoadingFallback />}><ProjectSelectorPage /></Suspense>
    </>
  );
}
