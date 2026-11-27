import { createRootRoute, Outlet } from '@tanstack/react-router';
import { lazy, Suspense } from 'react';

import { RouteAnnouncer } from '@/app-providers/router/RouteAnnouncer';
import { WebviewErrorReporter } from '@/shared/ui';

const StandaloneNotFound = lazy(() => import('@/app-providers/router/StandaloneNotFound'));
const StandaloneRouteError = lazy(() => import('@/app-providers/router/StandaloneRouteError'));

export const Route = createRootRoute({
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
