import { createFileRoute } from '@tanstack/react-router';
import { Suspense } from 'react';
import { AgentsWorkspace } from '@/app-providers/agents-workspace';
import { agentsSearch } from '@/shared/lib/navigation/screen-searches';
import { RouteLoadingFallback } from '@/shared/ui';
import { ScreenTitle } from '../../-site/ScreenTitle';
import type { ScreenHead } from '../../-site/screen-metadata';

const head: ScreenHead = {
  kind: 'card',
  path: 'agents',
  title: { namespace: 'agents', key: 'title' },
  description: { namespace: 'metadata', key: 'descriptions.agents' },
};

export const Route = createFileRoute('/$locale/_app/agents')({
  staticData: { head },
  validateSearch: agentsSearch,
  component: AgentsRoute,
});

function AgentsRoute() {
  const search = Route.useSearch();
  return (
    <>
      <ScreenTitle head={head} />
      <Suspense fallback={<RouteLoadingFallback />}><AgentsWorkspace search={search} /></Suspense>
    </>
  );
}
