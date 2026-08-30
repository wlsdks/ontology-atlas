/**
 * **How much width something docked on the right has taken** — floating surfaces
 * must stop that far short of the viewport edge.
 *
 * **Why it is needed** (review, 2026-08-16). With the conversation panel docked
 * to the right of the map, every surface positioned against the viewport edge
 * lands **on top of** that panel. A notification covering the composer was one
 * case; measuring found several of the same shape:
 *
 * - hover cards treat `window.innerWidth` as the right-hand wall
 * - context menus use the same wall
 *
 * But what those surfaces are describing is **the map**, whose right edge is not
 * the viewport's but **where the panel begins**. Take the wrong wall and you
 * write the map's story on top of the panel.
 *
 * **Why it is read from a CSS variable.** The width is set by dragging
 * (320–968px) and lives in React state. Passing that state down as a prop would
 * mean threading it through the entire map renderer — broad new wiring for one
 * value. Instead it is written **once onto the document** (by `HomePage`) and
 * read where needed, the same way notifications already work.
 */

/** Name of the variable holding the current right dock's width; absent means 0. */
export const RIGHT_DOCK_WIDTH_VAR = '--app-right-dock-width';

/** Width the dock occupies, in px. 0 on the server and where unsupported. */
function rightDockWidth(): number {
  if (typeof window === 'undefined' || typeof document === 'undefined') return 0;
  const raw = window
    .getComputedStyle(document.documentElement)
    .getPropertyValue(RIGHT_DOCK_WIDTH_VAR);
  const value = Number.parseFloat(raw);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

/**
 * The **right-hand wall** a floating surface must not cross.
 *
 * Viewport width minus the dock. It never goes below 0 even in the impossible
 * state where the dock reports wider than the viewport (a failed measurement) —
 * there, having no wall is better.
 */
export function floatingRightBound(viewportWidth: number, dockWidth: number): number {
  if (!Number.isFinite(viewportWidth) || viewportWidth <= 0) return 0;
  if (!Number.isFinite(dockWidth) || dockWidth <= 0) return viewportWidth;
  return Math.max(0, viewportWidth - dockWidth);
}

/** This viewport's right-hand wall — the two functions above, combined. */
export function currentFloatingRightBound(): number {
  if (typeof window === 'undefined') return 1920;
  return floatingRightBound(window.innerWidth, rightDockWidth());
}
