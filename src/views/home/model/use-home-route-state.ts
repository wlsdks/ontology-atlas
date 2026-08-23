'use client';

import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  applyHomeRouteState,
  DEFAULT_HOME_ROUTE_STATE,
  parseHomeRouteState,
  type HomeRouteState,
} from './url-state';

/** Custom event dispatched right after history.pushState. */
const HOME_URL_CHANGE_EVENT = 'app:urlchange';

function readHomeSearch() {
  if (typeof window === 'undefined') return '';
  return window.location.search;
}

/**
 * Serialises the home page's route state into URL query parameters and reads
 * it back.
 *
 * It subscribes **twice**: (1) `useSyncExternalStore` for popstate plus the
 * in-app pushState event, and (2) Next.js `useSearchParams` for app-router
 * navigation. Subscribing only to (1) meant a button navigating with a Next.js
 * `<Link>` changed the URL without refreshing route state. `window.location`
 * is always read fresh so the value is current whichever path changed it.
 */
export interface HomeRouteStateUpdateOptions {
  /**
   * Overwrite the current history entry instead of adding one. For writes that
   * *normalise the URL that was arrived at* (expanding the ancestors a deep
   * link needs, say) rather than user navigation — pushing those makes Back
   * walk through entries the user never visited.
   */
  replace?: boolean;
}

export function useHomeRouteState(): [
  HomeRouteState,
  (
    updater:
      | Partial<HomeRouteState>
      | ((current: HomeRouteState) => HomeRouteState),
    options?: HomeRouteStateUpdateOptions,
  ) => void,
] {
  const hydrated = useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false,
  );
  // useSearchParams subscribes to app-router changes (Link / router.push). Its
  // value tracks window.location, so it is referenced only as a re-render
  // trigger and never feeds the routeState computation below.
  const routerSearchParams = useSearchParams();
  const search = useSyncExternalStore(
    (onStoreChange) => {
      if (typeof window === 'undefined') return () => undefined;
      window.addEventListener('popstate', onStoreChange);
      window.addEventListener(HOME_URL_CHANGE_EVENT, onStoreChange);
      return () => {
        window.removeEventListener('popstate', onStoreChange);
        window.removeEventListener(HOME_URL_CHANGE_EVENT, onStoreChange);
      };
    },
    readHomeSearch,
    () => '',
  );

  // In deps so the useMemo re-runs when routerSearchParams changes;
  // window.location.search remains the source of truth. The react-hooks lint
  // rule cannot infer the dependency, hence the explicit .toString() variable.
  const routerSearchKey = routerSearchParams?.toString() ?? '';
  const routeState = useMemo(() => {
    // routerSearchKey is a dependency purely to trigger a re-run.
    void routerSearchKey;
    if (!hydrated) return DEFAULT_HOME_ROUTE_STATE;
    const currentSearch =
      typeof window !== 'undefined' ? window.location.search : search;
    return currentSearch.length > 0
      ? parseHomeRouteState(new URLSearchParams(currentSearch))
      : DEFAULT_HOME_ROUTE_STATE;
  }, [hydrated, search, routerSearchKey]);

  const updateRouteState = useCallback(
    (
      updater:
        | Partial<HomeRouteState>
        | ((current: HomeRouteState) => HomeRouteState),
      options?: HomeRouteStateUpdateOptions,
    ) => {
      if (typeof window === 'undefined') return;
      const current = parseHomeRouteState(
        new URLSearchParams(window.location.search),
      );
      const next =
        typeof updater === 'function'
          ? updater(current)
          : { ...current, ...updater };
      const params = applyHomeRouteState(
        new URLSearchParams(window.location.search),
        next,
      );
      const query = params.toString();
      // Use the *actual browser path*. next-intl's usePathname returns the
      // locale-stripped path (`/topology`), which drops `/ko` from the URL, and
      // reloading that URL breaks the static export's [locale] route. User
      // report: "reloading leaves the screen stuck loading" (reloading leaves the screen
      // stuck loading).
      const browserPath = window.location.pathname;
      const nextUrl = query ? `${browserPath}?${query}` : browserPath;
      // An identical result means there is no change to record. Pushing anyway
      // stacks **the same address** as another history entry, and the first
      // Back then changes nothing on screen — which reads as "Back is broken".
      // Measured on the project detail → map landing: history 2→4, and one Back
      // produced zero visible change. Most normalisation effects that run right
      // after landing are exactly this no-op.
      if (nextUrl === `${window.location.pathname}${window.location.search}`) {
        return;
      }
      if (options?.replace) {
        window.history.replaceState({}, '', nextUrl);
      } else {
        window.history.pushState({}, '', nextUrl);
      }
      window.dispatchEvent(new Event(HOME_URL_CHANGE_EVENT));
    },
    [],
  );

  return [routeState, updateRouteState];
}
