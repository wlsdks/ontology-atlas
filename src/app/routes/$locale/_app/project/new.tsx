import { createFileRoute } from '@tanstack/react-router';
import { Suspense } from 'react';
import { ProjectNewClientPage } from '@/app/[locale]/project/new/ProjectNewClientPage';
import { RouteLoadingFallback } from '@/shared/ui';
import { ScreenTitle } from '../../../-site/ScreenTitle';
import type { ScreenHead } from '../../../-site/screen-metadata';

const head: ScreenHead = {
  kind: 'title-only',
  title: { namespace: 'metadata', key: 'pages.projectNew' },
  follow: false,
};

export const Route = createFileRoute('/$locale/_app/project/new')({ staticData: { head }, component: ProjectNewRoute });

function ProjectNewRoute() {
  return (
    <>
      <ScreenTitle head={head} />
      <Suspense fallback={<RouteLoadingFallback />}><ProjectNewClientPage /></Suspense>
    </>
  );
}
