export type AppNavDestinationId =
  | "map"
  | "docs"
  | "insights"
  | "projects"
  | "agents"
  | "git";

/**
 * Pure prefix matcher for the canonical app destinations (feat/chrome-system
 * `#375` + feat/rail-rollout `#377`) — `AppNavRail` (desktop, `lg`+) and
 * `BottomTabBar` (mobile, `<lg`) share this ladder and MUST agree on which one
 * is "active" for a given pathname, so it lives here once instead of being
 * duplicated per widget. Compatibility routes under `/ontology/edit` and
 * `/ontology/studio` fold into `map`, while `/ontology/insights` keeps its own
 * destination. The mobile `BottomTabBar` renders the four core destinations
 * Map / Docs / Insights / Projects.
 */
export function resolveActiveNavDestination(pathname: string): AppNavDestinationId | null {
  // `usePathname()` from `@/i18n/navigation` is already locale-agnostic, but
  // this strips a stray `/en`/`/ko` prefix defensively anyway (raw
  // `next/navigation` pathnames, direct unit-test input) so the ladder below
  // never silently misses on a locale-prefixed path.
  const path = stripLocalePrefix(pathname || "/");
  if (path.startsWith("/ontology/edit") || path.startsWith("/ontology/studio"))
    return "map";
  if (path.startsWith("/ontology/insights")) return "insights";
  if (path.startsWith("/git")) return "git";
  // 「에이전트」 — 2026-08-20 목적지 신설(원장 90). `/agents` 하나뿐이라
  // 사다리 어디에 놓아도 같지만, 레일 순서와 같은 자리에 둔다.
  if (path.startsWith("/agents")) return "agents";
  if (path.startsWith("/docs")) return "docs";
  if (path.startsWith("/projects") || path.startsWith("/project/")) return "projects";
  if (path === "/" || path.startsWith("/topology")) return "map";
  return null;
}

/**
 * 관문 표면의 라우트 목록 — **경로만으로 관문이 확정되는 것들**.
 *
 * `/` 는 여기 없다. 그 주소는 경로가 아니라 **방문자가 누구인가**로 정해지므로
 * `isGatewaySurface` 가 따로 판정한다.
 *
 * ⚠️ **관문 표면을 새로 만들면 여기 한 줄을 더한다.** 안 더하면 그 화면만
 * 워크벤치 레일을 쓴다 — 2026-07-30 에 `/guide` · `/changelog` 를 만들면서
 * 실제로 한 번 겪었다(첫 렌더에 레일 6개 목적지가 그대로 떴다). 목록이 아니라
 * `startsWith("/download")` 한 줄이던 시절의 실패 모드이고, 목록으로 올려
 * 다음 사람이 여기를 보게 만든다.
 */
const GATEWAY_ROUTE_PREFIXES = ["/download", "/guide", "/changelog"] as const;

/**
 * 관문 라우트인가 — **워크벤치 크롬(좌측 레일)을 쓰지 않는 표면**.
 *
 * `surfaces.md` 가 웹의 1번 일을 **관문**(설치 없이 열어보는 자리, 링크 공유)
 * 으로 못박았는데, 좌측 레일은 "이미 볼트에서 일하는 사람" 의 크롬이다. 아직
 * 아무것도 안 연 방문자에게 지도·문서함·인사이트·프로젝트·에이전트·기록 6개
 * 목적지를 세워 두면 그건 관문이 아니라 워크벤치이고, 방문자는 자기가 아직
 * 아무 데도 못 가는 6개의 문을 본다.
 *
 * **이 판정이 셸에 있는 이유**: 페이지가 자기 셸 구조를 기억하게 하면 다음에
 * 만드는 관문 표면이 또 빠뜨린다(`AppShell` 주석의 #65 계열 drift — 공방이
 * 레일 유틸 슬롯 등록을 빠뜨려 그 화면만 하단 아이콘이 1개였던 전례). 경로
 * 하나로 셸이 정한다.
 *
 * 2026-07-28 소유자 확정.
 */
export function isGatewayRoute(pathname: string): boolean {
  const path = stripLocalePrefix(pathname || "/");
  return GATEWAY_ROUTE_PREFIXES.some((prefix) => path.startsWith(prefix));
}

/** `isGatewaySurface` 가 경로 밖에서 필요로 하는 것 — 방문자가 누구인가. */
export interface GatewayContext {
  /** 사용자 볼트가 열려 있는가(= 이 사람은 방문자가 아니라 작업자다). */
  hasVault: boolean;
  /** 설치된 데스크톱 앱 안인가. */
  desktop: boolean;
  /**
   * 볼트 상태를 아직 모르는 첫 프레임인가(정적 export 는 서버에서 모른다).
   *
   * 모를 때 `/` 는 **관문 쪽으로 기운다**. 반대로 기울면 방문자의 첫 프레임에
   * 레일이 그려졌다 사라지고, 그건 이 파일이 애초에 막으려던 깜빡임이다.
   * 볼트를 가진 재방문자는 경로 기억이 마지막 작업 화면으로 데려가므로 `/` 를
   * 거의 거치지 않는다 — 그래서 이 기울기의 비용을 무는 쪽이 더 적다.
   */
  vaultKnown: boolean;
}

/**
 * 이 표면이 지금 **관문인가** — 경로만으로는 못 정한다.
 *
 * `/` 는 2026-07-30 부터 **웹 방문자에게만** 얼굴(홍보)이고, 볼트를 연 사람과
 * 설치된 앱에게는 그대로 작업 진입점이다. 그래서 판정에 방문자 맥락이 든다.
 *
 * **왜 `/` 를 통째로 관문으로 만들지 않았나.** 그러면 설치된 앱이 자기를 쓰는
 * 사람에게 "다운로드하세요" 를 보여준다 — 2026-07 「root-first-open」 이
 * 없애려던 바로 그 모순이고, 그 결정을 뒤집으면서도 이 부분은 유효하다.
 * 뒤집힌 것은 "지도가 곧 첫 화면" 이지 "설치한 사람에게 설치를 권한다" 가
 * 아니다.
 */
export function isGatewaySurface(pathname: string, ctx: GatewayContext): boolean {
  const path = stripLocalePrefix(pathname || "/");
  if (GATEWAY_ROUTE_PREFIXES.some((prefix) => path.startsWith(prefix))) return true;
  if (path !== "/") return false;
  if (ctx.desktop) return false;
  return ctx.vaultKnown ? !ctx.hasVault : true;
}

/** `/ko/foo` → `/foo`. 라우트 판정이 로케일 프리픽스에 걸려 넘어지지 않게 한다. */
export function stripLocalePrefix(pathname: string): string {
  return pathname.replace(/^\/(?:en|ko)(?=\/|$)/, "") || "/";
}
