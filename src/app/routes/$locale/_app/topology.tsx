import { createFileRoute } from '@tanstack/react-router';
import { Suspense } from 'react';
import { homeSearch } from '@/shared/lib/navigation/screen-searches';
import { HomePage } from '@/views/home';
import { MapEntryPending } from '@/app-providers/router/MapEntryPending';
import { ScreenTitle } from '../../-site/ScreenTitle';
import type { ScreenHead } from '../../-site/screen-metadata';

const head: ScreenHead = {
  kind: 'card',
  path: 'topology',
  title: { namespace: 'metadata', key: 'pages.topology' },
  description: { namespace: 'metadata', key: 'descriptions.topology' },
};

export const Route = createFileRoute('/$locale/_app/topology')({
  staticData: { head },
  validateSearch: homeSearch,
  component: TopologyRoute,
});

function TopologyRoute() {
  const search = Route.useSearch();
  return (
    <>
      <ScreenTitle head={head} />
      <Suspense fallback={<MapEntryPending />}><HomePage search={search} /></Suspense>
    </>
  );
}
