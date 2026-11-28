import { createFileRoute } from '@tanstack/react-router';
import { Suspense } from 'react';
import { ProjectSelectorPage } from '@/views/project-selector';
import { RouteLoadingFallback } from '@/shared/ui';
import { ScreenTitle } from '../../-site/ScreenTitle';
import type { ScreenHead } from '../../-site/screen-metadata';

const head: ScreenHead = {
  kind: 'card',
  path: 'projects',
  title: { namespace: 'metadata', key: 'pages.projects' },
  description: { namespace: 'metadata', key: 'descriptions.projects' },
};

export const Route = createFileRoute('/$locale/_app/projects')({ staticData: { head }, component: ProjectsRoute });

function ProjectsRoute() {
  return (
    <>
      <ScreenTitle head={head} />
      <Suspense fallback={<RouteLoadingFallback />}><ProjectSelectorPage /></Suspense>
    </>
  );
}
