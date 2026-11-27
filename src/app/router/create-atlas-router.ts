import { createRouter } from '@tanstack/react-router';

import { setRouterHistory } from '@/shared/lib/navigation/history-write-guard';

import { routeTree } from '../route-tree.gen';
import { parseSearch, stringifySearch } from './atlas-search';

/**
 * The one router of the app. Addresses keep the shape `/<language>/<screen>/?query#hash`: a trailing
 * slash always, a query that is text only, and the router the only writer of history (direct writes in
 * product code go through `guardedHistoryWrite`, which hands them to this router's history).
 */
export function createAtlasRouter() {
  const router = createRouter({
    routeTree,
    parseSearch,
    stringifySearch,
    trailingSlash: 'always',
    scrollRestoration: true,
    defaultPreload: false,
  });
  setRouterHistory({
    push: (url) => router.history.push(url),
    replace: (url) => router.history.replace(url),
    flush: () => router.history.flush(),
  });
  return router;
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createAtlasRouter>;
  }
}
