import type { LayoutPoint } from "./library-graph-layout";

/**
 * **The window onto the picture** — where the canvas is looking, and how close.
 *
 * Pure arithmetic, no canvas and no React, for the reason the map's own
 * `topology-camera-math.ts` is separate from its loop: a claim about what a gesture did
 * to the view is testable here and only assertable through pixels anywhere else.
 *
 * ## Marks do not grow with the zoom, and that is the design
 *
 * Zooming scales **positions** and leaves every mark, line width and name at its own
 * fixed size. Two reasons, and the second is a repository rule:
 *
 * 1. On a folder where six pages cite the same seven sources, what a person zooms in for
 *    is to get the lines apart — not to make the dots bigger. Spreading answers that;
 *    magnifying does not.
 * 2. `.claude/rules/design.md` fixes the type scale, and a name is set in `text-label`
 *    (11px). A canvas that scaled its labels with a wheel would be running an unbounded
 *    type ramp nothing can gate.
 */

export interface LibraryGraphView {
  /** Screen pixels per world unit. */
  scale: number;
  /** The world point drawn at the centre of the canvas. */
  x: number;
  y: number;
}

/**
 * Zoom bounds, relative to the fit.
 *
 * They are **ratios of whatever the fit turned out to be**, not absolute scales — the
 * same rule the map settled on, and for the same reason: an absolute floor either forbids
 * zooming out on a small folder or lets a large one shrink to a smudge. Half the fit is as
 * far out as anything is worth seeing, and four times it puts a page's own cluster across
 * the pane.
 */
export const VIEW_ZOOM_OUT_RATIO = 0.5;
export const VIEW_ZOOM_IN_RATIO = 4;

/**
 * Wheel sensitivity: `exp(-pixelDelta × this)`, about 1.32× per 120px notch.
 *
 * The map measured its way to 0.0023 over three rounds (0.0016 → 0.0020 → 0.0023) and
 * this canvas inherits the number rather than starting that search again — a person who
 * has learned the zoom on the map should not have to learn a second one here.
 */
export const WHEEL_ZOOM_SENSITIVITY = 0.0023;

/**
 * Wheel deltas below this are ignored, unless the event is a pinch (`ctrlKey`).
 *
 * A resting finger on a trackpad emits a stream of 1–3px deltas; without this the picture
 * creeps while nobody is touching anything.
 */
const WHEEL_GLIDE_IGNORE_PX = 4;

/** `deltaMode: 1` is lines. 16px is the line height the map normalises with. */
const WHEEL_LINE_HEIGHT_PX = 16;

/**
 * A wheel event's delta in pixels, whatever unit the device reported it in.
 *
 * A line-mode mouse reports about 3 per notch; without this normalisation such a mouse
 * zoomed by half a percent per notch while a trackpad zoomed properly, and the defect
 * looked like a broken mouse rather than a missing conversion.
 */
export function wheelPixelDelta(event: Pick<WheelEvent, "deltaY" | "deltaMode">, viewportHeight: number): number {
  if (event.deltaMode === 1) return event.deltaY * WHEEL_LINE_HEIGHT_PX;
  if (event.deltaMode === 2) return event.deltaY * viewportHeight;
  return event.deltaY;
}

/** Whether a wheel event is a real gesture rather than trackpad tremor. */
export function isWheelZoomIntent(pixelDelta: number, ctrlKey: boolean): boolean {
  return ctrlKey || Math.abs(pixelDelta) >= WHEEL_GLIDE_IGNORE_PX;
}

export function wheelZoomFactor(pixelDelta: number): number {
  return Math.exp(-pixelDelta * WHEEL_ZOOM_SENSITIVITY);
}

export interface ViewBox {
  width: number;
  height: number;
}

export function worldToScreen(point: LayoutPoint, view: LibraryGraphView, box: ViewBox): LayoutPoint {
  return {
    x: box.width / 2 + (point.x - view.x) * view.scale,
    y: box.height / 2 + (point.y - view.y) * view.scale,
  };
}

export function screenToWorld(point: LayoutPoint, view: LibraryGraphView, box: ViewBox): LayoutPoint {
  return {
    x: view.x + (point.x - box.width / 2) / view.scale,
    y: view.y + (point.y - box.height / 2) / view.scale,
  };
}

/**
 * The view that puts the whole picture in the box, with room for the names.
 *
 * One scale for both axes — the fit may not distort a distance, which is the whole of what
 * this picture encodes — and the padding is the label allowance, not decoration: a mark on
 * the edge still has to have somewhere to put its name.
 */
export function fitView(
  bounds: { minX: number; minY: number; maxX: number; maxY: number } | null,
  box: ViewBox,
  padding: number,
): LibraryGraphView {
  if (!bounds) return { scale: 1, x: 0, y: 0 };
  const spanX = bounds.maxX - bounds.minX;
  const spanY = bounds.maxY - bounds.minY;
  const innerWidth = Math.max(1, box.width - padding * 2);
  const innerHeight = Math.max(1, box.height - padding * 2);
  // A single node, or a row of nodes on one axis, has zero span there. Scaling by it
  // divides by zero; scale 1 centres them instead, which is what a person expects to see.
  const scale = Math.min(spanX > 0 ? innerWidth / spanX : 1, spanY > 0 ? innerHeight / spanY : 1);
  return {
    scale,
    x: (bounds.minX + bounds.maxX) / 2,
    y: (bounds.minY + bounds.maxY) / 2,
  };
}

/** The interactive floor and ceiling, derived from the fit rather than fixed. */
export function scaleBounds(fitScale: number): { min: number; max: number } {
  const base = fitScale > 0 ? fitScale : 1;
  return { min: base * VIEW_ZOOM_OUT_RATIO, max: base * VIEW_ZOOM_IN_RATIO };
}

/**
 * Zoom about a point on the screen, keeping whatever is under it exactly there.
 *
 * The anchor is the whole of what makes a wheel zoom feel like a magnifier rather than a
 * slider: without it the picture grows away from the pointer and a person has to pan back
 * to what they were looking at after every notch.
 */
export function zoomViewAbout(
  view: LibraryGraphView,
  box: ViewBox,
  screenPoint: LayoutPoint,
  factor: number,
  bounds: { min: number; max: number },
): LibraryGraphView {
  const scale = Math.min(bounds.max, Math.max(bounds.min, view.scale * factor));
  if (scale === view.scale) return view;
  const anchor = screenToWorld(screenPoint, view, box);
  return {
    scale,
    // Solve `worldToScreen(anchor, next, box) === screenPoint` for the new centre.
    x: anchor.x - (screenPoint.x - box.width / 2) / scale,
    y: anchor.y - (screenPoint.y - box.height / 2) / scale,
  };
}

/**
 * Drag the background by a screen delta.
 *
 * **Incremental, against the previous sample** — never the whole gesture's delta divided
 * by the current scale. The map lost a day to that: a wheel zoom in the middle of a pan
 * retroactively rescaled everything already panned, because the whole-gesture form asks
 * the current scale about a distance travelled at an older one.
 */
export function panView(view: LibraryGraphView, screenDelta: LayoutPoint): LibraryGraphView {
  return {
    scale: view.scale,
    x: view.x - screenDelta.x / view.scale,
    y: view.y - screenDelta.y / view.scale,
  };
}
