import { createFileRoute } from '@tanstack/react-router';
import { Suspense } from 'react';
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

export const Route = createFileRoute('/$locale/_app/topology')({ staticData: { head }, component: TopologyRoute });

function TopologyRoute() {
  return (
    <>
      <ScreenTitle head={head} />
      <Suspense fallback={<MapEntryPending />}><HomePage /></Suspense>
    </>
  );
}
