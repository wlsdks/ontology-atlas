/**
 * The free lane a toast stands in. A surface marks its chrome
 * with `data-toast-wall="left" | "right" | "bottom"`, and the toaster centres between the
 * innermost side walls above the highest floor wall. Walls are declared rather than derived
 * from tokens because widths change at run time (INDEX folding, a dragged dock); the rendered
 * box already knows. Measured only while a toast is on screen.
 */

/** Below this free width the side walls are ignored and the toast uses the viewport. */
export const TOAST_LANE_MIN_WIDTH_PX = 360;

/** A taller floor wall is a sheet, and a toast on it would stand mid-screen. */
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
  left: number;
  right: number;
  /** px from the viewport's bottom edge to the top of the highest floor wall. */
  bottom: number;
}

/**
 * A wall with no area is not a wall. A lane narrower than {@link TOAST_LANE_MIN_WIDTH_PX}, as
 * beside a full-width sheet, falls back to the viewport width above that sheet.
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

/** A readout that faded and set `aria-hidden` keeps its box but is not a wall. */
function standing(element: HTMLElement): boolean {
  if (element.closest('[aria-hidden="true"]')) return false;
  const style = window.getComputedStyle(element);
  return style.visibility !== 'hidden' && Number.parseFloat(style.opacity) > 0.05;
}

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
