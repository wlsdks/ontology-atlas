import { createFileRoute } from '@tanstack/react-router';
import { Suspense } from 'react';
import { librarySearch } from '@/shared/lib/navigation/screen-searches';
import { DocsVaultPage } from '@/views/docs-vault';
import { RouteLoadingFallback } from '@/shared/ui';
import { ScreenTitle } from '../../-site/ScreenTitle';
import type { ScreenHead } from '../../-site/screen-metadata';

const head: ScreenHead = {
  kind: 'card',
  path: 'library',
  title: { namespace: 'metadata', key: 'pages.docs' },
  description: { namespace: 'metadata', key: 'descriptions.docs' },
};

export const Route = createFileRoute('/$locale/_app/docs')({
  staticData: { head },
  validateSearch: librarySearch,
  component: DocsRoute,
});

function DocsRoute() {
  const search = Route.useSearch();
  return (
    <>
      <ScreenTitle head={head} />
      <Suspense fallback={<RouteLoadingFallback />}><DocsVaultPage initialCollection="ontology" documentScope="ontology" legacyEntry search={search} /></Suspense>
    </>
  );
}
