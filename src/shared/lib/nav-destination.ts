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
 * `studio` (the 나침 무대 / Compass Stage) is a desktop-rail destination;
 * the mobile `BottomTabBar` renders only the core five.
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

function stripLocalePrefix(pathname: string): string {
  return pathname.replace(/^\/(?:en|ko)(?=\/|$)/, "") || "/";
}
