'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { routing } from '@/i18n/routing';

export const ROUTE_MEMORY_KEY = 'ontology-atlas:last-route';

export function isRestorableRoute(
  value: string | null | undefined,
  locales: readonly string[] = routing.locales,
): value is string {
  if (!value) return false;
  const locale = locales.find((l) => value.startsWith(`/${l}/`));
  if (!locale || value.length === locale.length + 2) return false;
  if (value.startsWith('//') || value.includes('://')) return false;
  if (/[\s"'<>\\]/.test(value)) return false;
  return true;
}

export function buildRestorableRoute(
  pathname: string,
  search = '',
  hash = '',
): string | null {
  if (!isRestorableRoute(pathname)) return null;
  const route = `${pathname}${search}${hash}`;
  return isRestorableRoute(route) ? route : null;
}

export function RouteMemory() {
  const pathname = usePathname();

  useEffect(() => {
    const rememberCurrentRoute = () => {
      const route = buildRestorableRoute(
        window.location.pathname,
        window.location.search,
        window.location.hash,
      );
      if (!route) return;

      try {
        window.localStorage.setItem(ROUTE_MEMORY_KEY, route);
      } catch {
        // localStorage unavailable: route restore is only a convenience.
      }
    };

    rememberCurrentRoute();
    // Surfaces replace the URL for in-surface selection (`?slug=`, `?node=`) and emit this
    // event; watching the pathname alone would lose that selection on relaunch.
    window.addEventListener('app:urlchange', rememberCurrentRoute);
    window.addEventListener('popstate', rememberCurrentRoute);
    window.addEventListener('hashchange', rememberCurrentRoute);
    return () => {
      window.removeEventListener('app:urlchange', rememberCurrentRoute);
      window.removeEventListener('popstate', rememberCurrentRoute);
      window.removeEventListener('hashchange', rememberCurrentRoute);
    };
  }, [pathname]);

  return null;
}
