import { stripLocalePrefix } from '@/shared/lib/nav-destination';

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

export function shouldHideBottomTabBar(pathname: string, _hasLoadedVault: boolean): boolean {
  const normalized = stripLocalePrefix(pathname).replace(/\/$/, '') || '/';
  // `/download` is the one standalone page with its own header nav.
  // NOTE: root-first-open (2026-07) made `/` the topology hub itself — it
  // renders the dogfood sample + first-run starter even with no vault, so it
  // is no longer a "marketing page". Hiding the tab bar there stranded tablet/
  // mobile first-run visitors with zero global nav (the desktop nav-rail is
  // `lg:flex` and this bar is `lg:hidden`, so on <lg nothing else covers nav).
  // Keep the bar on `/` regardless of vault state; `_hasLoadedVault` retained
  // for signature stability / future per-surface rules.
  if (normalized === '/download') return true;
  return false;
}

