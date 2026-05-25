/**
 * 모바일 BottomTabBar 의 한 탭 active 매칭 — pure helper.
 *
 * 정책:
 * 1. matchPrefixes 가 우선 — startsWith 매칭 — 홈 탭 ('/') 도
 *    ['/ontology', '/topology'] prefix 위에서 활성화 (홈 탭 라벨이
 *    'Ontology' 라 하위 surface 진입 시 아무 탭도 점등 안 되던 회귀 회피).
 * 2. prefix 가 안 잡히면 정확 일치 fallback — pathname 이 href 와 동일
 *    하거나 trailing-slash 변형까지 일치할 때만. 즉 '/' 일 때 홈 탭만,
 *    '/projects' 일 때 projects 탭만 활성되도록.
 */
export function isBottomTabActive(
  pathname: string,
  href: string,
  matchPrefixes: ReadonlyArray<string>,
): boolean {
  if (matchPrefixes.some((p) => pathname.startsWith(p))) return true;
  return pathname === href || pathname === href.replace(/\/$/, '');
}

export function shouldHideBottomTabBar(pathname: string, hasLoadedVault: boolean): boolean {
  const normalized = pathname.replace(/\/$/, '') || '/';
  if (normalized === '/download') return true;
  if (normalized === '/' && !hasLoadedVault) return true;
  return false;
}
