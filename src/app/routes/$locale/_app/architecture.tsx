import { createFileRoute, redirect } from '@tanstack/react-router';
import { Suspense } from 'react';
import { parseSearch } from '@/shared/lib/navigation/atlas-search';
import { HarnessPage, harnessSearch } from '@/views/architecture';
import { RouteLoadingFallback } from '@/shared/ui';
import { ScreenTitle } from '../../-site/ScreenTitle';
import type { ScreenHead } from '../../-site/screen-metadata';

const head: ScreenHead = {
  kind: 'card',
  path: 'architecture',
  title: { namespace: 'harness', key: 'title' },
  description: { namespace: 'harness', key: 'explainer' },
};

export const Route = createFileRoute('/$locale/_app/architecture')({
  staticData: { head },
  validateSearch: harnessSearch,
  // A retired `?view=` value is answered with the view that replaced it, before any screen renders.
  beforeLoad: async ({ location, search }) => {
    if (search.view === undefined) return;
    const { rewriteRetiredView } = await import('@/views/architecture');
    const rewritten = rewriteRetiredView(location.searchStr);
    if (rewritten === null) return;
    throw redirect({
      to: location.pathname,
      search: parseSearch(rewritten),
      ...(location.hash === '' ? {} : { hash: location.hash }),
      replace: true,
    });
  },
  component: ArchitectureRoute,
});

function ArchitectureRoute() {
  const search = Route.useSearch();
  return (
    <>
      <ScreenTitle head={head} />
      <Suspense fallback={<RouteLoadingFallback />}><HarnessPage search={search} /></Suspense>
    </>
  );
}
