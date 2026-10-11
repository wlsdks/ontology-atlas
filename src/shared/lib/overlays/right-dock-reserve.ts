/**
 * How much width something docked on the right has taken; floating surfaces describing the map must
 * stop that far short of the viewport edge. Read from a CSS variable written once onto the document
 * (by `HomePage`), since threading the React state through the map renderer is broad wiring.
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
