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

export function RouteMemory() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname) return;
    if (!isRestorableRoute(pathname)) return;

    try {
      window.localStorage.setItem(ROUTE_MEMORY_KEY, pathname);
    } catch {
      // localStorage unavailable — route restore is a convenience only.
    }
  }, [pathname]);

  return null;
}
