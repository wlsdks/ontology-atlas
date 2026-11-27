import { createRootRouteWithContext, Outlet } from '@tanstack/react-router';
import { lazy, Suspense } from 'react';

import { RouteAnnouncer } from '@/app-providers/router/RouteAnnouncer';
import { WebviewErrorReporter } from '@/shared/ui';

import type { BuildFacts } from './-site/build-facts';

const StandaloneNotFound = lazy(() => import('@/app-providers/router/StandaloneNotFound'));
const StandaloneRouteError = lazy(() => import('@/app-providers/router/StandaloneRouteError'));

/** The router's context: what the build machine knew about a public page (`BuildFacts`). */
export const Route = createRootRouteWithContext<{ buildFacts: BuildFacts }>()({
  component: RootRoute,
  notFoundComponent: () => (
    <Suspense fallback={null}>
      <StandaloneNotFound />
    </Suspense>
  ),
  errorComponent: ({ error, reset }) => (
    <Suspense fallback={null}>
      <StandaloneRouteError error={error instanceof Error ? error : new Error(String(error))} reset={reset} />
    </Suspense>
  ),
});

function RootRoute() {
  return (
    <>
      <WebviewErrorReporter />
      <RouteAnnouncer />
      <Outlet />
    </>
  );
}
