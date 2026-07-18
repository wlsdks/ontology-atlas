export type AppNavDestinationId = "map" | "docs" | "builder" | "insights" | "projects";

/**
 * Pure prefix matcher for the 5 canonical app destinations (feat/chrome-system
 * `#375` + feat/rail-rollout `#377`) — `AppNavRail` (desktop, `lg`+) and
 * `BottomTabBar` (mobile, `<lg`) both render the SAME 5 destinations and MUST
 * agree on which one is "active" for a given pathname, so the ladder lives
 * here once instead of being duplicated per widget. Order matters:
 * `builder`/`insights` both live under `/ontology/*` so they're checked
 * before the generic `map` root-match.
 */
export function resolveActiveNavDestination(pathname: string): AppNavDestinationId | null {
  // `usePathname()` from `@/i18n/navigation` is already locale-agnostic, but
  // this strips a stray `/en`/`/ko` prefix defensively anyway (raw
  // `next/navigation` pathnames, direct unit-test input) so the ladder below
  // never silently misses on a locale-prefixed path.
  const path = stripLocalePrefix(pathname || "/");
  if (path.startsWith("/ontology/edit")) return "builder";
  if (path.startsWith("/ontology/insights")) return "insights";
  if (path.startsWith("/docs")) return "docs";
  if (path.startsWith("/projects") || path.startsWith("/project/")) return "projects";
  if (path === "/" || path.startsWith("/topology")) return "map";
  return null;
}

function stripLocalePrefix(pathname: string): string {
  return pathname.replace(/^\/(?:en|ko)(?=\/|$)/, "") || "/";
}
