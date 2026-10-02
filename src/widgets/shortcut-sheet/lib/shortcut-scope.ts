import { stripLocalePrefix } from '@/shared/lib/nav-destination';

/**
 * The shortcut sheet's contextual scope: what works on the current screen comes first, and the All
 * tab keeps everything, so nothing is hidden for good.
 */

export type ShortcutSurface = "global" | "topology" | "docs";

/** Sheet tabs. `current` is the current screen plus global; `all` is the previous full list. */
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

/** Whether to show this section in this scope; `current` defers to `sectionVisibleForCurrent`. */
export function sectionVisible(
  scope: Exclude<ShortcutScope, "current">,
  surface: ShortcutSurface,
): boolean {
  if (scope === "all") return true;
  // Global shortcuts stay on every tab; switching tabs must not remove keys you can press now.
  if (surface === "global") return true;
  return scope === surface;
}

/** Which sections the `current` tab shows — the current screen's surface plus global. */
export function sectionVisibleForCurrent(
  currentSurface: ShortcutSurface,
  surface: ShortcutSurface,
): boolean {
  return surface === "global" || surface === currentSurface;
}
