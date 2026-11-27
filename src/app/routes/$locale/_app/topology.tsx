import { createFileRoute } from '@tanstack/react-router';
import { Suspense } from 'react';
import { HomePage } from '@/views/home';
import { MapEntryPending } from '@/app-providers/router/MapEntryPending';
import { PageTitle } from '@/app-providers/router/PageTitle';

export const Route = createFileRoute('/$locale/_app/topology')({ component: TopologyRoute });

function TopologyRoute() {
  return (
    <>
      <PageTitle namespace="metadata" messageKey="pages.topology" />
      <Suspense fallback={<MapEntryPending />}><HomePage /></Suspense>
    </>
  );
}
