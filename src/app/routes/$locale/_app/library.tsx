import { createFileRoute } from '@tanstack/react-router';
import { Suspense } from 'react';
import { LibraryWorkspace } from '@/app-providers/library-workspace';
import { librarySearch } from '@/shared/lib/navigation/screen-searches';
import { RouteLoadingFallback } from '@/shared/ui';
import { ScreenTitle } from '../../-site/ScreenTitle';
import type { ScreenHead } from '../../-site/screen-metadata';

const head: ScreenHead = {
  kind: 'card',
  path: 'library',
  title: { namespace: 'library', key: 'title' },
  description: { namespace: 'metadata', key: 'descriptions.library' },
};

export const Route = createFileRoute('/$locale/_app/library')({
  staticData: { head },
  validateSearch: librarySearch,
  component: LibraryRoute,
});

function LibraryRoute() {
  const search = Route.useSearch();
  return (
    <>
      <ScreenTitle head={head} />
      <Suspense fallback={<RouteLoadingFallback />}><LibraryWorkspace search={search} /></Suspense>
    </>
  );
}
