import { createFileRoute } from '@tanstack/react-router';
import { Suspense } from 'react';

import { PageTitle } from '@/app-providers/router/PageTitle';
import { RouteLoadingFallback } from '@/shared/ui';
import { RootEntryPage } from '@/views/root-entry';

export const Route = createFileRoute('/$locale/_app/')({ component: LocaleRootRoute });

function LocaleRootRoute() {
  return (
    <>
      <PageTitle namespace="metadata" messageKey="homeTitle" absolute />
      <Suspense fallback={<RouteLoadingFallback />}>
        <RootEntryPage />
      </Suspense>
    </>
  );
}
