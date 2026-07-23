/**
 * 모바일 BottomTabBar 의 한 탭 active 매칭 — pure helper.
 *
 * 정책:
 * 1. matchPrefixes 가 우선 — startsWith 매칭 — 루트 탭 ('/') 도
 *    ['/ontology'] prefix 위에서 활성화 (Concept map 하위 surface 진입 시
 *    아무 탭도 점등 안 되던 회귀 회피).
 * 2. prefix 가 안 잡히면 정확 일치 fallback — pathname 이 href 와 동일
 *    하거나 trailing-slash 변형까지 일치할 때만. 즉 '/' 일 때 홈 탭만,
 *    '/projects' 일 때 projects 탭만 활성되도록.
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
