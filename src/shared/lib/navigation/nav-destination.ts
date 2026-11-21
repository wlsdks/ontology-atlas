import { routing } from '@/i18n/routing';

export type AppNavDestinationId =
  | "map"
  | "architecture"
  | "docs"
  | "library"
  | "planning"
  | "automations"
  | "projects"
  | "agents"
  | "mcp"
  | "git"
  | "changes";

/**
 * `AppNavRail` and `BottomTabBar` must agree on the active destination. `/ontology/edit` and
 * `/ontology/studio` fold into `map`; other redirects match nothing.
 */
export function resolveActiveNavDestination(pathname: string): AppNavDestinationId | null {
  const path = stripLocalePrefix(pathname || "/");
  if (path.startsWith("/ontology/edit") || path.startsWith("/ontology/studio"))
    return "map";
  if (path.startsWith("/architecture")) return "architecture";
  if (path.startsWith("/git")) return "git";
  if (path.startsWith("/changes")) return "changes";
  if (path.startsWith("/agents")) return "agents";
  if (path.startsWith("/mcp")) return "mcp";
  if (path.startsWith("/library")) return "library";
  if (path.startsWith("/planning")) return "planning";
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

export interface GatewayContext {
  hasVault: boolean;
  desktop: boolean;
  /**
   * While unknown, `/` leans towards the gateway: the other way flashes the rail on a visitor's
   * first frame, and a returning user rarely passes through `/`.
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
