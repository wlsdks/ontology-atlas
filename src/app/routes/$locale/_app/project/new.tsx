import { createFileRoute } from '@tanstack/react-router';
import { Suspense } from 'react';
import { ProjectNewScreen } from '@/app-providers/project-screens/ProjectNewScreen';
import { projectNewSearch } from '@/app-providers/project-screens/project-new-search';
import { RouteLoadingFallback } from '@/shared/ui';
import { ScreenTitle } from '../../../-site/ScreenTitle';
import type { ScreenHead } from '../../../-site/screen-metadata';

const head: ScreenHead = {
  kind: 'title-only',
  title: { namespace: 'metadata', key: 'pages.projectNew' },
  follow: false,
};

export const Route = createFileRoute('/$locale/_app/project/new')({
  staticData: { head },
  validateSearch: projectNewSearch,
  component: ProjectNewRoute,
});

function ProjectNewRoute() {
  const search = Route.useSearch();
  return (
    <>
      <ScreenTitle head={head} />
      <Suspense fallback={<RouteLoadingFallback />}><ProjectNewScreen search={search} /></Suspense>
    </>
  );
}
