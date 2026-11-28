import { useEffect } from 'react';
import { useRouterState } from '@tanstack/react-router';
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

/** The address as the router wrote it (`/ko/docs/?slug=a#b`), or null when its path alone is not restorable. */
export function restorableRoute(address: string): string | null {
  const pathname = address.split(/[?#]/, 1)[0] ?? '';
  return isRestorableRoute(pathname) && isRestorableRoute(address) ? address : null;
}

export function RouteMemory() {
  const address = useRouterState({ select: (state) => state.resolvedLocation?.href });

  useEffect(() => {
    const route = address === undefined ? null : restorableRoute(address);
    if (!route) return;
    try {
      window.localStorage.setItem(ROUTE_MEMORY_KEY, route);
    } catch {
      // localStorage unavailable: route restore is only a convenience.
    }
  }, [address]);

  return null;
}
