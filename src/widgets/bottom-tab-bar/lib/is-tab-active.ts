/**
 * Active-tab matching for one mobile BottomTabBar tab — a pure helper.
 *
 * 1. `matchPrefixes` wins, matched with `startsWith`. The root tab ('/') also
 *    lights up under the `['/ontology']` prefix; without that, entering a
 *    Concept-map sub-surface left no tab lit at all.
 * 2. With no prefix hit, fall back to exact match — `pathname` equal to `href`
 *    or its trailing-slash variant. That keeps '/' lighting only the home tab
 *    and '/projects' only the projects tab.
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

function stripLocalePrefix(pathname: string): string {
  return pathname.replace(/^\/(?:en|ko)(?=\/|$)/, "") || "/";
}
