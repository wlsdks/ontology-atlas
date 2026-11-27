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
  | "changes"
  | "workStatus";

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
  if (path.startsWith("/work-status")) return "workStatus";
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
 * Routes that are website pages by path alone. `/` is absent because the installed app opens its
 * work entry there (`isGatewaySurface`). A new website page needs a line here, or that screen wears
 * the workbench rail.
 */
const GATEWAY_ROUTE_PREFIXES = ["/download", "/guide", "/changelog", "/sample"] as const;

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
  /** The installed app: its `/` is the work entry, never the website's gateway. */
  desktop: boolean;
}

/**
 * Is this surface a gateway right now. A browser has no folder to open, so there `/` is the gateway
 * (it hands over to `/download`); in the installed app `/` is where work starts, so the app never
 * tells its own user to download itself. Before the page knows which one it is (`desktop` false),
 * `/` leans towards the gateway: the other way flashes the rail on a visitor's first frame.
 */
export function isGatewaySurface(pathname: string, ctx: GatewayContext): boolean {
  const path = stripLocalePrefix(pathname || "/");
  if (GATEWAY_ROUTE_PREFIXES.some((prefix) => path.startsWith(prefix))) return true;
  return path === "/" && !ctx.desktop;
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

/**
 * Whether going to `href` keeps the screen at `currentPathname`: only the query or hash differ.
 * Either side may carry a locale prefix or a trailing slash.
 */
export function keepsRoute(href: string, currentPathname: string): boolean {
  if (href.startsWith("?") || href.startsWith("#")) return true;
  return routePath(href) === routePath(currentPathname);
}

function routePath(href: string): string {
  const path = stripLocalePrefix(href.split(/[?#]/, 1)[0] || "/");
  return path.length > 1 ? path.replace(/\/+$/, "") : path;
}
