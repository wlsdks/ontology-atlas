import { stripLocalePrefix } from '@/shared/lib/navigation/nav-destination';

/**
 * The shortcut sheet's contextual scope: what works on the current screen comes first, and the All
 * tab keeps everything, so nothing is hidden for good.
 */

export type ShortcutSurface = "global" | "topology" | "docs";

export type ShortcutScope = "current" | "topology" | "docs" | "all";

export const SHORTCUT_SCOPES: readonly ShortcutScope[] = ["current", "topology", "docs", "all"];

/**
 * The surface of the current route with the locale stripped; screens without dedicated shortcuts
 * are `global`.
 */
export function surfaceForPathname(pathname: string, libraryTab?: string | null): ShortcutSurface {
  const normalized = stripLocalePrefix(pathname);
  if (normalized === "/" || normalized.startsWith("/topology")) return "topology";
  if (normalized.startsWith("/docs")) return "docs";
  if (normalized.startsWith("/library") && libraryTab === "ontology") return "docs";
  return "global";
}

export function sectionVisible(
  scope: Exclude<ShortcutScope, "current">,
  surface: ShortcutSurface,
): boolean {
  if (scope === "all") return true;
  if (surface === "global") return true;
  return scope === surface;
}

export function sectionVisibleForCurrent(
  currentSurface: ShortcutSurface,
  surface: ShortcutSurface,
): boolean {
  return surface === "global" || surface === currentSurface;
}
