/**
 * The shortcut sheet's **contextual scope** (#67).
 *
 * The defect: pouring 8 sections of some 40 rows into two columns at once made the
 * dialog eat 852px at 1512×900 (95% of the viewport) with the bottom cut off, and
 * there was no signal that it could scroll (review 2026-07-25, measured; codex audit
 * P2).
 *
 * The answer is **classification, not hiding** — deleting shortcuts destroys
 * discoverability, so what is actually usable on the current screen comes first and
 * the rest sits behind a tab. The `All` (all) tab still shows everything, so no
 * information is lost.
 */

export type ShortcutSurface = "global" | "topology" | "docs";

/** Sheet tabs. `current` is the current screen plus global; `all` is the previous full list. */
export type ShortcutScope = "current" | "topology" | "docs" | "all";

export const SHORTCUT_SCOPES: readonly ShortcutScope[] = ["current", "topology", "docs", "all"];

/**
 * The surface of the route currently being viewed, decided with the locale prefix
 * stripped. Screens with no dedicated shortcuts (studio, insights, projects) are
 * `global` — it is honest for the "current screen" tab to show only global shortcuts.
 */
export function surfaceForPathname(pathname: string): ShortcutSurface {
  const normalized = pathname.replace(/^\/(?:en|ko)(?=\/|$)/, "") || "/";
  if (normalized === "/" || normalized.startsWith("/topology")) return "topology";
  if (normalized.startsWith("/docs")) return "docs";
  return "global";
}

/**
 * Whether to show this section in this scope. `current` needs to know the current
 * screen's surface, so it uses `sectionVisibleForCurrent`.
 */
export function sectionVisible(
  scope: Exclude<ShortcutScope, "current">,
  surface: ShortcutSurface,
): boolean {
  if (scope === "all") return true;
  // Global shortcuts (⌘K · ? · Esc) are valid on every tab, so they always remain —
  // switching tabs must not remove "keys you can press right now".
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
