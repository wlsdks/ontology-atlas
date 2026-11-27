import { createFileRoute } from '@tanstack/react-router';
import { Suspense } from 'react';
import { AutomationsWorkspace } from '@/app-providers/automations-workspace';
import { RouteLoadingFallback } from '@/shared/ui';
import { ScreenTitle } from '../../-site/ScreenTitle';
import type { ScreenHead } from '../../-site/screen-metadata';

const head: ScreenHead = {
  kind: 'card',
  path: 'automations',
  title: { namespace: 'automations', key: 'title' },
  description: { namespace: 'metadata', key: 'descriptions.automations' },
};

export const Route = createFileRoute('/$locale/_app/automations')({ staticData: { head }, component: AutomationsRoute });

function AutomationsRoute() {
  return (
    <>
      <ScreenTitle head={head} />
      <Suspense fallback={<RouteLoadingFallback />}><AutomationsWorkspace /></Suspense>
    </>
  );
}
