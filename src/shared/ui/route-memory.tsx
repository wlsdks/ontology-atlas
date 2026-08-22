'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

export const ROUTE_MEMORY_KEY = 'ontology-atlas:last-route';

export function isRestorableRoute(value: string | null | undefined): value is string {
  if (!value) return false;
  if (!value.startsWith('/en/') && !value.startsWith('/ko/')) return false;
  if (value === '/en/' || value === '/ko/') return false;
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
        // localStorage unavailable — route restore is a convenience only.
      }
    };

    rememberCurrentRoute();
    // Docs and topology update the URL with history.replaceState for fine-grained
    // work state and then emit this event. Watching pathname alone would miss the
    // selection within a surface (?slug=, ?node=), so relaunching the app would
    // return to the first document.
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
