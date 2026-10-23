/**
 * Measures the space a panel does not cover: the canvas minus covering panels (`computeFreeArea`)
 * and the width they take per side (`measureCanvasInsets`). Where the camera goes lives only in
 * `centerForInsets`. Shape decides the side: a tall panel is a side panel, a wide one a top bar.
 */

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  /** A product-owned inspector may be a camera obstacle even when its content
   * is shorter than the generic side-panel height heuristic. */
  readonly cameraObstacle?: "side-panel";
}

/**
 * Is that rectangle a **side panel** — true when it occupies at least this ratio
 * of the canvas height, unless an edge-attached product inspector declares the
 * same role explicitly because its content is shorter.
 *
 * Why 0.6: the measured popover is 813/982 = **0.83**, while the top toolbar is
 * under 100px tall and never exceeds 0.1. The two populations separate with room
 * to spare in between.
 */
export const SIDE_PANEL_HEIGHT_RATIO = 0.6;

/** Is that rectangle a **top bar** — at least this ratio of the canvas width. */
const TOP_BAR_WIDTH_RATIO = 0.6;

const right = (r: Rect) => r.x + r.width;
const bottom = (r: Rect) => r.y + r.height;

function intersects(a: Rect, b: Rect): boolean {
  return right(a) > b.x && a.x < right(b) && bottom(a) > b.y && a.y < bottom(b);
}

/**
 * The canvas with the panels subtracted.
 *
 * A panel that **splits the area down the middle** (an island touching neither
 * side) is not subtracted — subtracting one would break the remaining area in two
 * and leave «the centre» undefined. Every panel in this app is edge-attached
 * (measured), so that case does not exist today; it gets handled when it appears.
 */
export function computeFreeArea(canvas: Rect, obstacles: readonly Rect[]): Rect {
  let left = canvas.x;
  let rightEdge = right(canvas);
  let top = canvas.y;
  let bottomEdge = bottom(canvas);

  for (const panel of obstacles) {
    if (!intersects(panel, canvas)) continue;

    const explicitSidePanel = panel.cameraObstacle === "side-panel";
    const wideEnough = panel.width >= canvas.width * TOP_BAR_WIDTH_RATIO;
    /*
     * The declaration cannot decide which edge: below `lg` the inspector is a full-width bottom sheet,
     * so measured width settles the edge first, then the declaration.
     */
    const tallEnough =
      (explicitSidePanel && !wideEnough) ||
      panel.height >= canvas.height * SIDE_PANEL_HEIGHT_RATIO;

    if (tallEnough && !wideEnough) {
      // A side panel — subtracted from whichever side is nearer the canvas centre.
      const panelCenter = panel.x + panel.width / 2;
      if (panelCenter >= canvas.x + canvas.width / 2) {
        rightEdge = Math.min(rightEdge, panel.x);
      } else {
        left = Math.max(left, right(panel));
      }
      continue;
    }
    if (wideEnough && !tallEnough) {
      const panelCenter = panel.y + panel.height / 2;
      if (panelCenter >= canvas.y + canvas.height / 2) {
        bottomEdge = Math.min(bottomEdge, panel.y);
      } else {
        top = Math.max(top, bottom(panel));
      }
    }
    // Neither or both (a sheet covering everything, a small island) is not subtracted.
  }

  // If overlapping panels invert the area, fall back to the canvas — «the centre is
  // the screen centre» beats «there is no centre».
  if (rightEdge <= left || bottomEdge <= top) return canvas;
  return { x: left, y: top, width: rightEdge - left, height: bottomEdge - top };
}

/**
 * Measures from the DOM what covers the canvas. Hidden, zero-size, near-transparent, collapsed
 * or `aria-hidden` boxes are skipped, as are the canvas's ancestors and descendants. A modal is
 * not a panel; `data-topology-camera-obstacle="none"` opts a non-modal transient surface out.
 */
export function collectCanvasObstacles(
  canvas: Element,
  canvasRect: Rect,
  /**
   * The smallest side counted. 40 keeps the camera to panels and bars; a router that must keep
   * a line out from under every control (the hex board) asks for the small ones too — the
   * folded INDEX tab is 26 px wide.
   */
  { minSide = 40 }: { minSide?: number } = {},
): Rect[] {
  const out: Rect[] = [];
  const MIN_SIDE = minSide;
  for (const el of canvas.ownerDocument.querySelectorAll('body *')) {
    if (el === canvas || canvas.contains(el) || el.contains(canvas)) continue;
    const box = el.getBoundingClientRect();
    if (box.width < MIN_SIDE || box.height < MIN_SIDE) continue;
    if (box.right <= canvasRect.x || box.left >= canvasRect.x + canvasRect.width) continue;
    if (box.bottom <= canvasRect.y || box.top >= canvasRect.y + canvasRect.height) continue;
    if (el.closest('details:not([open])')) continue;
    // Screen-reader-only content is clipped to a pixel: its children report their full boxes
    // but cover nothing (the hex board's tile list is 40 buttons down the canvas's left edge).
    if (el.closest('.sr-only')) continue;
    if (el.closest('[aria-hidden="true"]')) continue;
    if (el.closest('[aria-modal="true"], [data-topology-camera-obstacle="none"]')) continue;
    const style = getComputedStyle(el);
    if (style.visibility === 'hidden' || style.display === 'none') continue;
    if (Number(style.opacity) < 0.05) continue;
    const cameraObstacle = el.getAttribute("data-topology-camera-obstacle") === "side-panel" ? "side-panel" as const : undefined;
    // Keep outer geometry without losing an explicit panel's role.
    if (out.some((r) => (!cameraObstacle || r.cameraObstacle === cameraObstacle) && r.x <= box.x && r.y <= box.y && r.x + r.width >= box.right && r.y + r.height >= box.bottom)) {
      continue;
    }
    out.push({
      x: box.x,
      y: box.y,
      width: box.width,
      height: box.height,
      ...(cameraObstacle ? { cameraObstacle } : {}),
    });
  }
  return out;
}

/**
 * **Measure the canvas's left and right insets** — the values to feed the insets
 * the camera maths already uses.
 *
 * ## Why measure — the tokens are static while the panel state is not
 *
 * `topology-camera-math.ts` **already** uses safe insets
 * (`safeInsetLeft/Right/...`, *"the left ReaderLens panel, right popover rail"*).
 * But those values are CSS tokens and therefore fixed, while the real geometry
 * varies with state. Measured (1512×982):
 *
 * | | left | right |
 * |---|---|---|
 * | reserved by the tokens | 78 | 120 |
 * | actual (before selection, INDEX open) | **324** | 0 |
 * | actual (after selection, popover open) | 0 | **384** |
 *
 * Neither state matches. So **the day before, I built a second correction** — a
 * free-area shift on the selection path only, which was a second system for the
 * same concern (what this repository calls «a second system running alongside»).
 * The right prescription is not one more shift but **feeding true values into the
 * insets that already exist**.
 *
 * ## Top and bottom are not measured — those are not panels
 *
 * `safeInsetTop` (148) is the top tool lane plus the docking chips, and
 * `safeInsetBottom` (96) is **reserved label space** (derived from `LABEL_OFFSET`
 * — without that reservation, the bottom-most node's label once disappeared
 * silently). Both are layout promises rather than «covering panels», and replacing
 * them with measurement brings that accident back. So **only left and right** are
 * measured.
 *
 * And **the larger of the two wins** against the token value, so width the token
 * reserved for some reason other than a panel is not lost.
 */
export interface CanvasInsets {
  left: number;
  right: number;
}

export function measureCanvasInsets(canvas: Element, canvasRect: Rect): CanvasInsets {
  let left = 0;
  let right = 0;
  for (const panel of collectCanvasObstacles(canvas, canvasRect)) {
    const explicitSidePanel = panel.cameraObstacle === "side-panel";
    const tall =
      explicitSidePanel || panel.height >= canvasRect.height * SIDE_PANEL_HEIGHT_RATIO;
    const wide = panel.width >= canvasRect.width * TOP_BAR_WIDTH_RATIO;
    if (!tall || wide) continue;
    const panelCenter = panel.x + panel.width / 2;
    if (panelCenter >= canvasRect.x + canvasRect.width / 2) {
      right = Math.max(right, canvasRect.x + canvasRect.width - panel.x);
    } else {
      left = Math.max(left, panel.x + panel.width - canvasRect.x);
    }
  }
  return { left: Math.round(left), right: Math.round(right) };
}

/** A declared fit obstacle that is really on screen — the same discipline as `collectCanvasObstacles`. */
function isShownObstacle(el: Element, box: DOMRect): boolean {
  if (box.width <= 0 || box.height <= 0) return false;
  if (el.closest('details:not([open])') || el.closest('[aria-hidden="true"]')) return false;
  const style = getComputedStyle(el);
  return style.visibility !== 'hidden' && style.display !== 'none' && Number(style.opacity) >= 0.05;
}

/**
 * Chrome standing in a column on one edge of the canvas: how far in it reaches and the span it covers,
 * or `null`. The rail tiles and folded INDEX tab are under the 40px floor of
 * `collectCanvasObstacles`, so each declares itself with `data-map-fit-obstacle` (`left` or `right`).
 */
export interface EdgeFitObstacle {
  /** How far in from its edge of the canvas the column reaches, px. */
  reach: number;
  /** The span it covers, from the canvas's top, px. */
  top: number;
  bottom: number;
}

export function measureEdgeFitObstacle(canvas: Element, side: "left" | "right"): EdgeFitObstacle | null {
  const c = canvas.getBoundingClientRect();
  if (c.width <= 0 || c.height <= 0) return null;
  let found: EdgeFitObstacle | null = null;
  for (const el of canvas.ownerDocument.querySelectorAll(`[data-map-fit-obstacle="${side}"]`)) {
    const box = el.getBoundingClientRect();
    if (!isShownObstacle(el, box)) continue;
    if (box.right <= c.left || box.left >= c.right || box.bottom <= c.top || box.top >= c.bottom) continue;
    const reach = side === "right" ? c.right - box.left : box.right - c.left;
    const top = box.top - c.top;
    const bottom = box.bottom - c.top;
    found =
      found === null
        ? { reach, top, bottom }
        : { reach: Math.max(found.reach, reach), top: Math.min(found.top, top), bottom: Math.max(found.bottom, bottom) };
  }
  return found === null
    ? null
    : { reach: Math.round(found.reach), top: Math.round(found.top), bottom: Math.round(found.bottom) };
}

/** Air the fit keeps between the drawing and a bottom strip. */
const BOTTOM_OBSTACLE_GAP_PX = 8;

/**
 * Bottom height taken by a strip declared with `data-map-fit-obstacle="bottom"`, in px, or 0.
 * The strip declares itself because its size alone does not identify it as a panel.
 */
export function measureBottomFitObstacle(canvas: Element): number {
  const c = canvas.getBoundingClientRect();
  if (c.width <= 0 || c.height <= 0) return 0;
  let reserve = 0;
  for (const el of canvas.ownerDocument.querySelectorAll('[data-map-fit-obstacle="bottom"]')) {
    const box = el.getBoundingClientRect();
    if (box.width <= 0 || box.height <= 0) continue;
    if (box.right <= c.left || box.left >= c.right || box.bottom <= c.top || box.top >= c.bottom) continue;
    reserve = Math.max(reserve, c.bottom - box.top + BOTTOM_OBSTACLE_GAP_PX);
  }
  return Math.round(reserve);
}
