import { createFileRoute } from '@tanstack/react-router';
import { Suspense } from 'react';
import { ProjectFallbackClient } from '@/app/[locale]/project/fallback/ProjectFallbackClient';
import { RouteLoadingFallback } from '@/shared/ui';
import { ScreenTitle } from '../../../-site/ScreenTitle';
import type { ScreenHead } from '../../../-site/screen-metadata';

const head: ScreenHead = {
  kind: 'title-only',
  title: { namespace: 'projectPages.detail', key: 'topBarProjectsLabel' },
  follow: false,
};

export const Route = createFileRoute('/$locale/_app/project/fallback')({ staticData: { head }, component: ProjectFallbackRoute });

function ProjectFallbackRoute() {
  return (
    <>
      <ScreenTitle head={head} />
      <Suspense fallback={<RouteLoadingFallback />}><ProjectFallbackClient /></Suspense>
    </>
  );
}
