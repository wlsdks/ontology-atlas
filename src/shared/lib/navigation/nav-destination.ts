import { routing } from '@/i18n/routing';

export type AppNavDestinationId =
  | "map"
  | "architecture"
  | "docs"
  | "library"
  | "automations"
  | "insights"
  | "projects"
  | "agents"
  | "mcp"
  | "git"
  | "changes";

/**
 * Pure prefix matcher for the canonical app destinations (feat/chrome-system
 * `#375` + feat/rail-rollout `#377`) — `AppNavRail` (desktop, `lg`+) and
 * `BottomTabBar` (mobile, `<lg`) share this ladder and MUST agree on which one
 * is "active" for a given pathname, so it lives here once instead of being
 * duplicated per widget. Compatibility routes under `/ontology/edit` and
 * `/ontology/studio` fold into `map`, while `/ontology/insights` keeps its own
 * destination. The mobile `BottomTabBar` renders the five persistent reading
 * and planning destinations from `MOBILE_DESTINATION_IDS`.
 */
export function resolveActiveNavDestination(pathname: string): AppNavDestinationId | null {
  // `usePathname()` from `@/i18n/navigation` is already locale-agnostic, but
  // this strips a stray locale prefix defensively anyway (raw
  // `next/navigation` pathnames, direct unit-test input) so the ladder below
  // never silently misses on a locale-prefixed path.
  const path = stripLocalePrefix(pathname || "/");
  if (path.startsWith("/ontology/edit") || path.startsWith("/ontology/studio"))
    return "map";
  if (path.startsWith("/ontology/insights")) return "insights";
  if (path.startsWith("/architecture")) return "architecture";
  if (path.startsWith("/git")) return "git";
  if (path.startsWith("/changes")) return "changes";
  if (path.startsWith("/agents")) return "agents";
  if (path.startsWith("/mcp")) return "mcp";
  if (path.startsWith("/library")) return "library";
  if (path.startsWith("/automations")) return "automations";
  if (path.startsWith("/docs")) return "library";
  if (path.startsWith("/projects") || path.startsWith("/project/")) return "projects";
  if (path === "/" || path.startsWith("/topology")) return "map";
  return null;
}

/**
 * Routes that are gateway surfaces by path alone. `/` is absent because who the visitor is decides
 * it (`isGatewaySurface`). A new gateway surface needs a line here, or that screen wears the
 * workbench rail.
 */
const GATEWAY_ROUTE_PREFIXES = ["/download", "/guide", "/changelog"] as const;

/**
 * A gateway route does not wear the workbench chrome (the left rail): workbench destinations in
 * front of a visitor who opened nothing are doors they cannot walk through. The shell decides this,
 * not each page, so the next gateway surface cannot forget it.
 */
export function isGatewayRoute(pathname: string): boolean {
  const path = stripLocalePrefix(pathname || "/");
  return GATEWAY_ROUTE_PREFIXES.some((prefix) => path.startsWith(prefix));
}

/** What `isGatewaySurface` needs beyond the path — who the visitor is. */
export interface GatewayContext {
  /** Is a vault open — i.e. this person is working, not visiting. */
  hasVault: boolean;
  /** Are we inside the installed desktop app? */
  desktop: boolean;
  /**
   * Is this the first frame, where the vault state is still unknown? (Static
   * export cannot know it on the server.)
   *
   * While unknown, `/` **leans towards the gateway**. Leaning the other way paints
   * the rail on a visitor's first frame and then removes it — exactly the flash
   * this file exists to prevent. A returning user with a vault is carried to their
   * last screen by route memory and rarely passes through `/` at all, so leaning
   * this way costs fewer people.
   */
  vaultKnown: boolean;
}

/**
 * Is this surface a gateway right now. `/` is the marketing face only for a web visitor; with a
 * vault open, or in the installed app, it stays the work entry point, so the app never tells its own
 * user to download itself.
 */
export function isGatewaySurface(pathname: string, ctx: GatewayContext): boolean {
  const path = stripLocalePrefix(pathname || "/");
  if (GATEWAY_ROUTE_PREFIXES.some((prefix) => path.startsWith(prefix))) return true;
  if (path !== "/") return false;
  if (ctx.desktop) return false;
  return ctx.vaultKnown ? !ctx.hasVault : true;
}

/** `/ko/foo` → `/foo`, so route matching never trips over a locale prefix. */
export function stripLocalePrefix(
  pathname: string,
  locales: readonly string[] = routing.locales,
): string {
  for (const locale of locales) {
    const prefix = `/${locale}`;
    if (pathname === prefix) return "/";
    if (pathname.startsWith(`${prefix}/`)) return pathname.slice(prefix.length);
  }
  return pathname || "/";
}
