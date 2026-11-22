/**
 * How much width something docked on the right has taken; floating surfaces describing the map must
 * stop that far short of the viewport edge. Read from a CSS variable written once onto the document
 * (by `HomePage`), since threading the React state through the map renderer is broad wiring.
 */

export const RIGHT_DOCK_WIDTH_VAR = '--app-right-dock-width';

function rightDockWidth(): number {
  if (typeof window === 'undefined' || typeof document === 'undefined') return 0;
  const raw = window
    .getComputedStyle(document.documentElement)
    .getPropertyValue(RIGHT_DOCK_WIDTH_VAR);
  const value = Number.parseFloat(raw);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

/**
 * The right-hand wall a floating surface must not cross: viewport width minus the dock, never below 0.
 * A dock reported wider than the viewport is a failed measurement, and no wall beats a negative one.
 */
export function floatingRightBound(viewportWidth: number, dockWidth: number): number {
  if (!Number.isFinite(viewportWidth) || viewportWidth <= 0) return 0;
  if (!Number.isFinite(dockWidth) || dockWidth <= 0) return viewportWidth;
  return Math.max(0, viewportWidth - dockWidth);
}

export function currentFloatingRightBound(): number {
  if (typeof window === 'undefined') return 1920;
  return floatingRightBound(window.innerWidth, rightDockWidth());
}
