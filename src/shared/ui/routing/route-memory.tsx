import { useEffect } from 'react';
import { useLocation } from '@tanstack/react-router';
import { routing } from '@/i18n/routing';
import { useCommittedAddress } from '@/shared/lib/navigation/use-committed-address';

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
  const { pathname, searchString } = useCommittedAddress();
  const hash = useLocation({ select: (location) => location.hash });

  useEffect(() => {
    const route = buildRestorableRoute(pathname, searchString, hash === '' ? '' : `#${hash}`);
    if (!route) return;
    try {
      window.localStorage.setItem(ROUTE_MEMORY_KEY, route);
    } catch {
      // localStorage unavailable: route restore is only a convenience.
    }
  }, [pathname, searchString, hash]);

  return null;
}
