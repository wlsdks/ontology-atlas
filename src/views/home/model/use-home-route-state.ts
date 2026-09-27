'use client';

import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  applyHomeRouteState,
  DEFAULT_HOME_ROUTE_STATE,
  parseHomeRouteState,
  type HomeRouteState,
} from './url-state';
import { guardedHistoryWrite } from '@/shared/lib/history-write-guard';

/** Dispatched right after history.pushState. */
const HOME_URL_CHANGE_EVENT = 'app:urlchange';

function readHomeSearch() {
  if (typeof window === 'undefined') return '';
  return window.location.search;
}

/**
 * Serialises route state to query parameters and back. Subscribes to popstate plus the in-app push
 * event
 * and to `useSearchParams`, or a Next `<Link>` changes the URL without refreshing state;
 * `window.location` is always read fresh.
 */
export interface HomeRouteStateUpdateOptions {
  /**
   * For normalising the arrival URL rather than navigation, so Back does not walk unvisited
   * entries.
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
  // Only a re-render trigger for app-router changes; never feeds routeState.
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

  // An explicit string so the react-hooks lint rule sees the dependency.
  const routerSearchKey = routerSearchParams?.toString() ?? '';
  const routeState = useMemo(() => {
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
      // The actual browser path: next-intl's `usePathname` drops the locale, and reloading that
      // breaks the static
      // export's [locale] route.
      const browserPath = window.location.pathname;
      const nextUrl = query ? `${browserPath}?${query}` : browserPath;
      // An identical URL pushes nothing, or Back changes nothing on screen and reads as broken.
      if (nextUrl === `${window.location.pathname}${window.location.search}`) {
        return;
      }
      // Through the shared budget, or a runaway loop hits WebKit's 100-per-10s limit and throws
      // (`shared/lib/history-write-guard.ts`).
      if (!guardedHistoryWrite(options?.replace ? 'replace' : 'push', nextUrl)) return;
      window.dispatchEvent(new Event(HOME_URL_CHANGE_EVENT));
    },
    [],
  );

  return [routeState, updateRouteState];
}
