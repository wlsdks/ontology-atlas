/**
 * **The free lane a toast stands in** (owner, 2026-09-24).
 *
 * A toast is centred at the bottom of the space the screen's own chrome leaves free,
 * never across that chrome. A surface says which of its boxes are walls with
 * `data-toast-wall="left" | "right" | "bottom"` — the nav rail, the map's INDEX stack
 * and docked panel stand at the sides; the map's corner readout and its first-visit hint
 * stand on the floor — and the toaster centres between the innermost left and right
 * walls, above the highest floor wall.
 *
 * **Why walls are declared rather than computed from tokens.** INDEX is 300px expanded
 * and a 26px tab collapsed, the dock is whatever width a person dragged it to, the
 * readout steps aside while a panel is open, and the rail zooms at 1920 and disappears
 * below `lg`. A token formula would have to repeat every one of those rules; the
 * rendered box already knows the answer.
 *
 * Measured only while a toast is on screen (`ToastProvider`), so the cost of the lane is
 * zero when there is nothing to place.
 */

/** Below this much free width the side walls are ignored and the toast uses the viewport. */
export const TOAST_LANE_MIN_WIDTH_PX = 360;

/**
 * A floor wall taller than this share of the window is a sheet, not a floor: standing a
 * toast on top of it would put the box in the middle of the screen.
 */
export const TOAST_FLOOR_MAX_SHARE = 0.4;

export const TOAST_LEFT_WALL_VAR = '--app-toast-left-wall';
export const TOAST_RIGHT_WALL_VAR = '--app-toast-right-wall';
export const TOAST_BOTTOM_WALL_VAR = '--app-toast-bottom-wall';

export interface ToastWallRect {
  side: 'left' | 'right' | 'bottom';
  left: number;
  right: number;
  top: number;
  width: number;
  height: number;
}

export interface ToastLane {
  /** px from the viewport's left edge to the lane. */
  left: number;
  /** px from the viewport's right edge to the lane. */
  right: number;
  /** px from the viewport's bottom edge to the top of the highest floor wall. */
  bottom: number;
}

/**
 * The lane between the walls. A wall with no area (a hidden rail, an unmounted tab) is
 * not a wall. A lane narrower than {@link TOAST_LANE_MIN_WIDTH_PX} — a panel drawn as a
 * full-width sheet — is no lane at all, and the toast falls back to the viewport's
 * width, drawn above that sheet like any transient.
 */
export function resolveToastLane(
  viewportWidth: number,
  viewportHeight: number,
  walls: readonly ToastWallRect[],
): ToastLane {
  if (!Number.isFinite(viewportWidth) || viewportWidth <= 0) return { left: 0, right: 0, bottom: 0 };
  let left = 0;
  let right = 0;
  let bottom = 0;
  for (const wall of walls) {
    if (!(wall.width > 0 && wall.height > 0)) continue;
    if (wall.side === 'left') left = Math.max(left, Math.min(viewportWidth, wall.right));
    else if (wall.side === 'right') right = Math.max(right, Math.max(0, viewportWidth - wall.left));
    else if (Number.isFinite(viewportHeight) && viewportHeight > 0) {
      const rise = viewportHeight - wall.top;
      if (rise > 0 && rise <= viewportHeight * TOAST_FLOOR_MAX_SHARE) bottom = Math.max(bottom, rise);
    }
  }
  if (viewportWidth - left - right < TOAST_LANE_MIN_WIDTH_PX) {
    left = 0;
    right = 0;
  }
  return { left: Math.round(left), right: Math.round(right), bottom: Math.round(bottom) };
}

/**
 * A wall that has stepped aside is not a wall: the map's readout fades to `opacity: 0`
 * and marks itself `aria-hidden` while a panel is open, and keeps its box.
 */
function standing(element: HTMLElement): boolean {
  if (element.closest('[aria-hidden="true"]')) return false;
  const style = window.getComputedStyle(element);
  return style.visibility !== 'hidden' && Number.parseFloat(style.opacity) > 0.05;
}

/** Reads every declared wall from the document and publishes the lane as variables. */
export function publishToastLane(): Element[] {
  if (typeof document === 'undefined' || typeof window === 'undefined') return [];
  const elements = Array.from(document.querySelectorAll<HTMLElement>('[data-toast-wall]'));
  const walls: ToastWallRect[] = [];
  for (const element of elements) {
    const side = element.dataset.toastWall;
    if (side !== 'left' && side !== 'right' && side !== 'bottom') continue;
    if (!standing(element)) continue;
    const rect = element.getBoundingClientRect();
    walls.push({ side, left: rect.left, right: rect.right, top: rect.top, width: rect.width, height: rect.height });
  }
  const root = document.documentElement;
  const lane = resolveToastLane(root.clientWidth || window.innerWidth, root.clientHeight || window.innerHeight, walls);
  root.style.setProperty(TOAST_LEFT_WALL_VAR, `${lane.left}px`);
  root.style.setProperty(TOAST_RIGHT_WALL_VAR, `${lane.right}px`);
  root.style.setProperty(TOAST_BOTTOM_WALL_VAR, `${lane.bottom}px`);
  return elements;
}
