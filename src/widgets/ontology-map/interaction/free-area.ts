/**
 * Measures the space a panel does not cover: the canvas minus covering panels (`computeFreeArea`)
 * and the width they take per side (`measureCanvasInsets`). Where the camera goes lives only in
 * `centerForInsets`. Shape decides the side: a tall panel is a side panel, a wide one a top bar.
 */

import type { Box } from "../dial/dial-shapes";

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  /** A product-owned inspector may be a camera obstacle even when its content
   * is shorter than the generic side-panel height heuristic. */
  readonly cameraObstacle?: "side-panel";
}

/** A rectangle taking at least this share of the canvas height is a side panel (an edge-attached product inspector may declare the role): the measured popover is 0.83, the top toolbar never exceeds 0.1. */
export const SIDE_PANEL_HEIGHT_RATIO = 0.6;

/** A rectangle at least this share of the canvas width is a top bar. */
const TOP_BAR_WIDTH_RATIO = 0.6;

const right = (r: Rect) => r.x + r.width;
const bottom = (r: Rect) => r.y + r.height;

function intersects(a: Rect, b: Rect): boolean {
  return right(a) > b.x && a.x < right(b) && bottom(a) > b.y && a.y < bottom(b);
}

/**
 * The canvas with the panels subtracted. A panel that splits the area down the middle (touching neither side) is not
 * subtracted, as it would leave «the centre» undefined; every panel today is edge-attached.
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
  /** The smallest side counted. 40 keeps the camera to panels and bars; the hex board's router asks for smaller (the folded INDEX tab is 26 px wide). */
  { minSide = 40 }: { minSide?: number } = {},
): Rect[] {
  const out: Rect[] = [];
  const MIN_SIDE = minSide;
  for (const domElement of canvas.ownerDocument.querySelectorAll('body *')) {
    if (domElement === canvas || canvas.contains(domElement) || domElement.contains(canvas)) continue;
    const box = domElement.getBoundingClientRect();
    if (box.width < MIN_SIDE || box.height < MIN_SIDE) continue;
    if (box.right <= canvasRect.x || box.left >= canvasRect.x + canvasRect.width) continue;
    if (box.bottom <= canvasRect.y || box.top >= canvasRect.y + canvasRect.height) continue;
    if (domElement.closest('details:not([open])')) continue;
    // Screen-reader-only content is clipped to a pixel: its children report their full boxes
    // but cover nothing (the hex board's tile list is 40 buttons down the canvas's left edge).
    if (domElement.closest('.sr-only')) continue;
    if (domElement.closest('[aria-hidden="true"]')) continue;
    if (domElement.closest('[aria-modal="true"], [data-topology-camera-obstacle="none"]')) continue;
    const style = getComputedStyle(domElement);
    if (style.visibility === 'hidden' || style.display === 'none') continue;
    if (Number(style.opacity) < 0.05) continue;
    const cameraObstacle = domElement.getAttribute("data-topology-camera-obstacle") === "side-panel" ? "side-panel" as const : undefined;
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
 * Measures the canvas's left and right insets, to feed the insets the camera maths already uses: the tokens are static
 * while the real geometry varies with state (1512×982: the tokens reserve 78/120, the panels take 324/0 before selection
 * and 0/384 after). Top and bottom stay unmeasured: they are layout promises (the tool lane; label space reserved from
 * `LABEL_OFFSET`), not covering panels. The larger of measurement and token wins, so width reserved for another reason is not lost.
 */
export interface CanvasInsets {
  left: number;
  right: number;
}

/** The canvas side a covering box stands on as a side panel, or null for a bar, a sheet or an island. */
function sidePanelSide(panel: Rect, canvasRect: Rect): "left" | "right" | null {
  const explicitSidePanel = panel.cameraObstacle === "side-panel";
  const tall =
    explicitSidePanel || panel.height >= canvasRect.height * SIDE_PANEL_HEIGHT_RATIO;
  const wide = panel.width >= canvasRect.width * TOP_BAR_WIDTH_RATIO;
  if (!tall || wide) return null;
  return panel.x + panel.width / 2 >= canvasRect.x + canvasRect.width / 2 ? "right" : "left";
}

export function measureCanvasInsets(canvas: Element, canvasRect: Rect, panels: readonly Rect[] = collectCanvasObstacles(canvas, canvasRect)): CanvasInsets {
  let left = 0;
  let right = 0;
  for (const panel of panels) {
    const side = sidePanelSide(panel, canvasRect);
    if (side === "right") right = Math.max(right, canvasRect.x + canvasRect.width - panel.x);
    else if (side === "left") left = Math.max(left, panel.x + panel.width - canvasRect.x);
  }
  return { left: Math.round(left), right: Math.round(right) };
}

/** A declared fit obstacle that is really on screen — the same discipline as `collectCanvasObstacles`. */
function isShownObstacle(domElement: Element, box: DOMRect): boolean {
  if (box.width <= 0 || box.height <= 0) return false;
  if (domElement.closest('details:not([open])') || domElement.closest('[aria-hidden="true"]')) return false;
  const style = getComputedStyle(domElement);
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
  for (const domElement of canvas.ownerDocument.querySelectorAll(`[data-map-fit-obstacle="${side}"]`)) {
    const box = domElement.getBoundingClientRect();
    if (!isShownObstacle(domElement, box)) continue;
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

/** The side panels' widths the camera reads, and the chrome no canvas name may be drawn under. */
export interface PanelInsets extends CanvasInsets {
  nameObstacles?: readonly Box[];
}

/** The pointer-taking islands of a pass-through lane: what of a wide tool row the reader can see. */
function laneControls(lane: Element): Element[] {
  const out: Element[] = [];
  for (const domElement of lane.querySelectorAll("*")) {
    const parent = domElement.parentElement;
    if (parent && getComputedStyle(domElement).pointerEvents !== "none" && getComputedStyle(parent).pointerEvents === "none") out.push(domElement);
  }
  return out;
}

/**
 * Canvas boxes a name must stay out of: each side panel on a `sides` side, widened to its canvas
 * edge so the gap beside the rail counts too; the edge columns; and the chrome declared
 * `data-map-name-obstacle`: the element itself (the key), or with `controls` each island of a
 * pass-through lane (the tool row). `panels` passes a `collectCanvasObstacles` walk already made
 * for this canvas. O(elements over the canvas).
 */
export function measureNameObstacles(canvas: Element, sides: { left: boolean; right: boolean }, panels?: readonly Rect[]): Box[] {
  const c = canvas.getBoundingClientRect();
  if (c.width <= 0 || c.height <= 0) return [];
  const canvasRect: Rect = { x: c.left, y: c.top, width: c.width, height: c.height };
  const out: Box[] = [];
  for (const panel of panels ?? collectCanvasObstacles(canvas, canvasRect)) {
    const side = sidePanelSide(panel, canvasRect);
    if (side === null || !sides[side]) continue;
    const minY = panel.y - c.top;
    const maxY = panel.y + panel.height - c.top;
    out.push(side === "left" ? { minX: 0, maxX: panel.x + panel.width - c.left, minY, maxY } : { minX: panel.x - c.left, maxX: c.width, minY, maxY });
  }
  for (const side of ["left", "right"] as const) {
    const edge = measureEdgeFitObstacle(canvas, side);
    if (edge) out.push(side === "left" ? { minX: 0, maxX: edge.reach, minY: edge.top, maxY: edge.bottom } : { minX: c.width - edge.reach, maxX: c.width, minY: edge.top, maxY: edge.bottom });
  }
  for (const declared of canvas.ownerDocument.querySelectorAll("[data-map-name-obstacle]")) {
    const parts = declared.getAttribute("data-map-name-obstacle") === "controls" ? laneControls(declared) : [declared];
    for (const domElement of parts) {
      const box = domElement.getBoundingClientRect();
      if (!isShownObstacle(domElement, box) || box.right <= c.left || box.left >= c.right || box.bottom <= c.top || box.top >= c.bottom) continue;
      out.push({ minX: box.left - c.left, maxX: box.right - c.left, minY: box.top - c.top, maxY: box.bottom - c.top });
    }
  }
  return out;
}

const BOTTOM_OBSTACLE_GAP_PX = 8;

/**
 * Bottom height taken by a strip declared with `data-map-fit-obstacle="bottom"`, in px, or 0.
 * The strip declares itself because its size alone does not identify it as a panel.
 */
export function measureBottomFitObstacle(canvas: Element): number {
  const c = canvas.getBoundingClientRect();
  if (c.width <= 0 || c.height <= 0) return 0;
  let reserve = 0;
  for (const domElement of canvas.ownerDocument.querySelectorAll('[data-map-fit-obstacle="bottom"]')) {
    const box = domElement.getBoundingClientRect();
    if (box.width <= 0 || box.height <= 0) continue;
    if (box.right <= c.left || box.left >= c.right || box.bottom <= c.top || box.top >= c.bottom) continue;
    reserve = Math.max(reserve, c.bottom - box.top + BOTTOM_OBSTACLE_GAP_PX);
  }
  return Math.round(reserve);
}
