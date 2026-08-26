export type AppNavDestinationId =
  | "map"
  | "architecture"
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
 * destination. The mobile `BottomTabBar` renders the five persistent reading
 * and planning destinations from `MOBILE_DESTINATION_IDS`.
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
  if (path.startsWith("/architecture")) return "architecture";
  if (path.startsWith("/git")) return "git";
  // Agents — destination added 2026-08-20 (decision ledger 90). `/agents` is its
  // only route so the rung's position is arbitrary; it matches the rail's order.
  if (path.startsWith("/agents")) return "agents";
  if (path.startsWith("/docs")) return "docs";
  if (path.startsWith("/projects") || path.startsWith("/project/")) return "projects";
  if (path === "/" || path.startsWith("/topology")) return "map";
  return null;
}

/**
 * Routes that are gateway surfaces **by path alone**.
 *
 * `/` is deliberately absent: that address is decided by **who the visitor is**,
 * not by the path, so `isGatewaySurface` judges it separately.
 *
 * ⚠️ **Adding a gateway surface means adding a line here.** Forget it and that
 * one screen wears the workbench rail instead — which actually happened when
 * `/guide` and `/changelog` were added on 2026-07-30 (the rail's six destinations
 * appeared on first render). That was the failure mode back when this was a
 * single `startsWith("/download")`; promoting it to a list is what makes the next
 * person look here.
 */
const GATEWAY_ROUTE_PREFIXES = ["/download", "/guide", "/changelog"] as const;

/**
 * Is this a gateway route — **a surface that does not wear the workbench chrome
 * (the left rail)**?
 *
 * `.claude/rules/surfaces.md` pins the web's primary job as the **gateway**: a
 * place to open the map with no install, and a link to share. The left rail is
 * chrome for someone already working in a vault. Standing seven destinations (map,
 * architecture, docs, insights, projects, agents, git) in front of a visitor who has opened
 * nothing makes it a workbench, not a gateway — they see seven doors none of which
 * they can walk through yet.
 *
 * **Why the shell decides this, not the page**: making each page remember its own
 * shell structure means the next gateway surface forgets again (the same drift
 * described in `AppShell`'s comments, where the studio failed to register the
 * rail's utility slot and ended up with one bottom icon). One path, one decision,
 * in the shell.
 *
 * Owner decision, 2026-07-28.
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
 * Is this surface **a gateway right now**? The path alone cannot say.
 *
 * Since 2026-07-30, `/` is the marketing face **only for a web visitor**; for
 * someone with a vault open, and inside the installed app, it stays the work
 * entry point. Hence the visitor context in the judgement.
 *
 * **Why `/` was not simply made a gateway wholesale.** Then the installed app
 * would tell its own user to download the app — the very contradiction the
 * 2026-07 「root-first-open」 decision (the map as the first screen) removed. That
 * decision was overturned in the part that said "the map is the first screen",
 * not in the part that said "never offer the install to someone who installed it".
 */
export function isGatewaySurface(pathname: string, ctx: GatewayContext): boolean {
  const path = stripLocalePrefix(pathname || "/");
  if (GATEWAY_ROUTE_PREFIXES.some((prefix) => path.startsWith(prefix))) return true;
  if (path !== "/") return false;
  if (ctx.desktop) return false;
  return ctx.vaultKnown ? !ctx.hasVault : true;
}

/** `/ko/foo` → `/foo`, so route matching never trips over a locale prefix. */
export function stripLocalePrefix(pathname: string): string {
  return pathname.replace(/^\/(?:en|ko)(?=\/|$)/, "") || "/";
}
