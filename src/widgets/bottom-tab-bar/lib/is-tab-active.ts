import { stripLocalePrefix } from '@/shared/lib/navigation/nav-destination';

/**
 * Active-tab matching: `matchPrefixes` with startsWith first, then an exact match with or without a
 * trailing slash.
 */
export function isBottomTabActive(
  pathname: string,
  href: string,
  matchPrefixes: ReadonlyArray<string>,
): boolean {
  const normalized = stripLocalePrefix(pathname);
  if (matchPrefixes.some((p) => normalized.startsWith(p))) return true;
  return normalized === href || normalized === href.replace(/\/$/, '');
}

