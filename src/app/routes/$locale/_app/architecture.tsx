import { createFileRoute } from '@tanstack/react-router';
import { Suspense } from 'react';
import { HarnessPage } from '@/views/architecture';
import { RouteLoadingFallback } from '@/shared/ui';
import { ScreenTitle } from '../../-site/ScreenTitle';
import type { ScreenHead } from '../../-site/screen-metadata';

const head: ScreenHead = {
  kind: 'card',
  path: 'architecture',
  title: { namespace: 'harness', key: 'title' },
  description: { namespace: 'harness', key: 'explainer' },
};

export const Route = createFileRoute('/$locale/_app/architecture')({ staticData: { head }, component: ArchitectureRoute });

function ArchitectureRoute() {
  return (
    <>
      <ScreenTitle head={head} />
      <Suspense fallback={<RouteLoadingFallback />}><HarnessPage /></Suspense>
    </>
  );
}
