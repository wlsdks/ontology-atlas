import { createFileRoute } from '@tanstack/react-router';
import { Suspense } from 'react';
import { LibraryWorkspace } from '@/app-providers/library-workspace';
import { RouteLoadingFallback } from '@/shared/ui';
import { PageTitle } from '@/app-providers/router/PageTitle';

export const Route = createFileRoute('/$locale/_app/library')({ component: LibraryRoute });

function LibraryRoute() {
  return (
    <>
      <PageTitle namespace="library" messageKey="title" />
      <Suspense fallback={<RouteLoadingFallback />}><LibraryWorkspace /></Suspense>
    </>
  );
}
