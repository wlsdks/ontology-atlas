import { createFileRoute } from '@tanstack/react-router';
import { Suspense } from 'react';
import { ProjectFallbackScreen } from '@/app-providers/project-screens/ProjectFallbackScreen';
import { projectFallbackSearch } from '@/app-providers/project-screens/project-fallback-search';
import { RouteLoadingFallback } from '@/shared/ui';
import { ScreenTitle } from '../../../-site/ScreenTitle';
import type { ScreenHead } from '../../../-site/screen-metadata';

const head: ScreenHead = {
  kind: 'title-only',
  title: { namespace: 'projectPages.detail', key: 'topBarProjectsLabel' },
  follow: false,
};

export const Route = createFileRoute('/$locale/_app/project/fallback')({
  staticData: { head },
  validateSearch: projectFallbackSearch,
  component: ProjectFallbackRoute,
});

function ProjectFallbackRoute() {
  const search = Route.useSearch();
  return (
    <>
      <ScreenTitle head={head} />
      <Suspense fallback={<RouteLoadingFallback />}><ProjectFallbackScreen search={search} /></Suspense>
    </>
  );
}
