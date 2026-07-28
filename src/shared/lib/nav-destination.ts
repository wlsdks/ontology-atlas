export type AppNavDestinationId =
  | "map"
  | "docs"
  | "studio"
  | "insights"
  | "projects"
  | "git";

/**
 * Pure prefix matcher for the canonical app destinations (feat/chrome-system
 * `#375` + feat/rail-rollout `#377`) — `AppNavRail` (desktop, `lg`+) and
 * `BottomTabBar` (mobile, `<lg`) share this ladder and MUST agree on which one
 * is "active" for a given pathname, so it lives here once instead of being
 * duplicated per widget. Order matters: `studio`/`insights` both live under
 * `/ontology/*` so they're checked before the generic `map` root-match. The
 * retired ERD builder route (`/ontology/edit`, now a redirect to the studio)
 * folds into `studio` so the rail stays highlighted through the redirect.
 * `studio` (the 나침 무대 / Compass Stage) and `git` are desktop-rail
 * destinations; the mobile `BottomTabBar` renders the four core destinations
 * Map / Docs / Insights / Projects.
 */
export function resolveActiveNavDestination(pathname: string): AppNavDestinationId | null {
  // `usePathname()` from `@/i18n/navigation` is already locale-agnostic, but
  // this strips a stray `/en`/`/ko` prefix defensively anyway (raw
  // `next/navigation` pathnames, direct unit-test input) so the ladder below
  // never silently misses on a locale-prefixed path.
  const path = stripLocalePrefix(pathname || "/");
  if (path.startsWith("/ontology/edit") || path.startsWith("/ontology/studio"))
    return "studio";
  if (path.startsWith("/ontology/insights")) return "insights";
  if (path.startsWith("/git")) return "git";
  if (path.startsWith("/docs")) return "docs";
  if (path.startsWith("/projects") || path.startsWith("/project/")) return "projects";
  if (path === "/" || path.startsWith("/topology")) return "map";
  return null;
}

/**
 * 관문 라우트인가 — **워크벤치 크롬(좌측 레일)을 쓰지 않는 표면**.
 *
 * `surfaces.md` 가 웹의 1번 일을 **관문**(설치 없이 열어보는 자리, 링크 공유)
 * 으로 못박았는데, 좌측 레일은 "이미 볼트에서 일하는 사람" 의 크롬이다. 아직
 * 아무것도 안 연 방문자에게 지도·문서함·공방·인사이트·프로젝트·기록 6개
 * 목적지를 세워 두면 그건 관문이 아니라 워크벤치이고, 방문자는 자기가 아직
 * 아무 데도 못 가는 6개의 문을 본다.
 *
 * **이 판정이 셸에 있는 이유**: 페이지가 자기 셸 구조를 기억하게 하면 다음에
 * 만드는 관문 표면이 또 빠뜨린다(`AppShell` 주석의 #65 계열 drift — 공방이
 * 레일 유틸 슬롯 등록을 빠뜨려 그 화면만 하단 아이콘이 1개였던 전례). 경로
 * 하나로 셸이 정한다.
 *
 * 2026-07-28 소유자 확정. 오늘은 `/download` 하나다 — 목록이 늘면 여기 한 줄.
 */
export function isGatewayRoute(pathname: string): boolean {
  return stripLocalePrefix(pathname || "/").startsWith("/download");
}

function stripLocalePrefix(pathname: string): string {
  return pathname.replace(/^\/(?:en|ko)(?=\/|$)/, "") || "/";
}
