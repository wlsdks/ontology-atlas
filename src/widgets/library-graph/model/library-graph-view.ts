import type { LayoutPoint } from "./library-graph-layout";

/**
 * The camera: pure arithmetic, so what a gesture did to the view is testable without
 * pixels. Marks scale with the zoom (world radius × {@link LibraryGraphView.scale}, clamped
 * at both ends); names never do, since `.claude/rules/design.md` fixes the type scale. The
 * zoom only decides which names exist ({@link SOURCE_LABEL_MIN_SCALE}).
 */

export interface LibraryGraphView {
  /** Screen pixels per world unit. */
  scale: number;
  /** The world point drawn at the centre of the canvas. */
  x: number;
  y: number;
}

/**
 * Absolute zoom bounds, stated as drawn marks, since a fit-relative bound lets the window
 * balloon a small folder's marks. The ceiling draws the widest mark at most a map node
 * wide ({@link libraryZoomMax}); {@link LIBRARY_ZOOM_MIN} keeps a source's square at
 * {@link MIN_SOURCE_MARK_PX}, below which it is noise and the person pans instead.
 */
export const LIBRARY_MAX_MARK_PX = 36;
/** The smallest a source's square may be drawn, across, in canvas pixels. */
export const MIN_SOURCE_MARK_PX = 3;
/**
 * Mirrors `LIBRARY_SOURCE_RADIUS`, repeated so the view keeps no model dependency; the
 * view's test (`library-graph-view.test.ts`) asserts they agree.
 */
export const SOURCE_MARK_WORLD_RADIUS = 3.5;
/** Mirrors `LIBRARY_PAGE_RADIUS_MAX` — the top of the mark band — on the same terms. */
export const WIDEST_MARK_WORLD_RADIUS = 9;
/** Mirrors `LIBRARY_PAGE_RADIUS_MIN`, the floor of the band a *named* thing is drawn at. */
export const NAMED_MARK_WORLD_RADIUS_MIN = 5;
export const LIBRARY_ZOOM_MIN = MIN_SOURCE_MARK_PX / (SOURCE_MARK_WORLD_RADIUS * 2);

/**
 * The zoom ceiling for a folder's widest mark, floored at
 * {@link NAMED_MARK_WORLD_RADIUS_MIN}, or a files-only folder balloons its squares; so
 * between 2.0 and 3.6.
 */
export function libraryZoomMax(widestWorldRadius: number): number {
  return LIBRARY_MAX_MARK_PX / (2 * Math.max(NAMED_MARK_WORLD_RADIUS_MIN, widestWorldRadius));
}

/** The ceiling of the ordinary folder — one whose busiest page is at the top of the band. */
export const LIBRARY_ZOOM_MAX = libraryZoomMax(WIDEST_MARK_WORLD_RADIUS);

/**
 * The zoom from which files are named at rest; a pointed-at file, or one in the open page's
 * neighbourhood, is named at any zoom, and pages are asked first, since "which write-ups
 * exist" is the home's question. Between the fixtures' fitted scales (0.49–2.0) and the
 * ceiling: small folders name files at rest, large ones once zoomed in.
 */
export const SOURCE_LABEL_MIN_SCALE = 1.4;

/**
 * Wheel sensitivity, `exp(-pixelDelta × this)`, about 1.32× per 120px notch: the map's
 * measured value, so both canvases zoom alike.
 */
const WHEEL_ZOOM_SENSITIVITY = 0.0023;

/** Wheel deltas below this are ignored unless pinching (`ctrlKey`), or a resting trackpad finger creeps the picture. */
const WHEEL_GLIDE_IGNORE_PX = 4;

/** `deltaMode: 1` is lines. 16px is the line height the map normalises with. */
const WHEEL_LINE_HEIGHT_PX = 16;

/** A wheel delta in pixels whatever unit it came in, or a line-mode mouse barely zooms. */
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

export function worldToScreen(
  point: LayoutPoint,
  view: LibraryGraphView,
  box: ViewBox,
  out: LayoutPoint = { x: 0, y: 0 },
): LayoutPoint {
  out.x = box.width / 2 + (point.x - view.x) * view.scale;
  out.y = box.height / 2 + (point.y - view.y) * view.scale;
  return out;
}

export function screenToWorld(point: LayoutPoint, view: LibraryGraphView, box: ViewBox): LayoutPoint {
  return {
    x: view.x + (point.x - box.width / 2) / view.scale,
    y: view.y + (point.y - box.height / 2) / view.scale,
  };
}

/**
 * The view that puts the whole picture in the box: one scale for both axes, so no distance
 * distorts, with padding as room for edge marks' names.
 */
export function fitView(
  bounds: { minX: number; minY: number; maxX: number; maxY: number } | null,
  box: ViewBox,
  padding: number,
  maxScale: number = LIBRARY_ZOOM_MAX,
): LibraryGraphView {
  if (!bounds) return { scale: 1, x: 0, y: 0 };
  const spanX = bounds.maxX - bounds.minX;
  const spanY = bounds.maxY - bounds.minY;
  const innerWidth = Math.max(1, box.width - padding * 2);
  const innerHeight = Math.max(1, box.height - padding * 2);
  // A zero span on an axis would divide by zero; that axis takes scale 1 instead.
  const wanted = Math.min(spanX > 0 ? innerWidth / spanX : 1, spanY > 0 ? innerHeight / spanY : 1);
  // Clamped, so the fit frames rather than magnifies a small folder.
  const scale = Math.min(maxScale, Math.max(LIBRARY_ZOOM_MIN, wanted));
  return {
    scale,
    x: (bounds.minX + bounds.maxX) / 2,
    y: (bounds.minY + bounds.maxY) / 2,
  };
}

/**
 * The interactive floor and ceiling. Absolute, and the same pair the fit is clamped into,
 * so a wheel can never take a mark anywhere the fit would not have put it.
 */
export function scaleBounds(maxScale: number = LIBRARY_ZOOM_MAX): { min: number; max: number } {
  return { min: LIBRARY_ZOOM_MIN, max: maxScale };
}

/**
 * Whether two cameras show the same picture to the eye (half a pixel of travel, 0.2% of
 * zoom), so the fit tile never offers a no-op press.
 */
export function isSameView(view: LibraryGraphView, target: LibraryGraphView): boolean {
  if (Math.abs(view.scale - target.scale) / Math.max(1e-6, target.scale) > 0.002) return false;
  const travel = Math.hypot(view.x - target.x, view.y - target.y) * target.scale;
  return travel <= 0.5;
}

/** Zoom about a screen point, keeping what is under it in place, like a magnifier. */
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
 * Drag the background by a screen delta since the previous sample, never the whole
 * gesture's delta, or a zoom mid-pan rescales distance already panned.
 */
export function panView(view: LibraryGraphView, screenDelta: LayoutPoint): LibraryGraphView {
  return {
    scale: view.scale,
    x: view.x - screenDelta.x / view.scale,
    y: view.y - screenDelta.y / view.scale,
  };
}
