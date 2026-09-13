import type { LayoutPoint } from "./library-graph-layout";

/**
 * **The window onto the picture** — where the canvas is looking, and how close.
 *
 * Pure arithmetic, no canvas and no React, for the reason the map's own
 * `topology-camera-math.ts` is separate from its loop: a claim about what a gesture did
 * to the view is testable here and only assertable through pixels anywhere else.
 *
 * ## Marks scale with the zoom; names do not
 *
 * ⚠️ **Both used to be fixed in screen pixels.** That was the right rule while the mark
 * band was itself a function of the canvas — the canvas decided the size, so the wheel had
 * better not decide it again. The band is now a fixed **world** scale
 * (`libraryMarkRadii`), which means the camera is the single place a drawn size comes
 * from, and a mark that ignored the camera would be a dot that stays 18px across whether a
 * person is looking at the whole folder or at one page's satellites. So a mark's drawn
 * half-extent is its world radius times {@link LibraryGraphView.scale}, and the scale is
 * clamped at both ends, which is what bounds the drawn size without asking the window.
 *
 * A **name** still does not scale, and the reason is a repository rule rather than a
 * preference: `.claude/rules/design.md` fixes the type scale, and a canvas that ran its
 * labels up and down with a wheel would be an unbounded type ramp nothing can gate. What
 * the zoom decides about names is *which ones exist* — see {@link SOURCE_LABEL_MIN_SCALE}.
 */

export interface LibraryGraphView {
  /** Screen pixels per world unit. */
  scale: number;
  /** The world point drawn at the centre of the canvas. */
  x: number;
  y: number;
}

/**
 * **Absolute zoom bounds, and the mark scale is why.**
 *
 * ⚠️ They used to be ratios of whatever the fit turned out to be — half the fit out, four
 * times it in — which is the right rule when marks are a fixed number of *screen* pixels,
 * because then the zoom only ever changes how far apart things are. It is the wrong rule
 * here. A mark is a fixed size in **world** units now (`libraryMarkRadii`), so the camera's
 * scale is the only thing between a folder and how big its dots look, and a fit-relative
 * bound hands that back to the canvas: six documents on a 1920 window would fit at a scale
 * of three and wear 43px marks, which is the picture the owner rejected.
 *
 * So both ends are absolute, and **both are stated as a drawn mark rather than as a number
 * of times**: a ratio would have to be read against a world radius to mean anything, and
 * that is exactly the arithmetic a person is doing when they call a folder empty.
 *
 * - **The ceiling is {@link LIBRARY_MAX_MARK_PX}** — the widest mark in the folder is drawn
 *   at most that far across, and {@link libraryZoomMax} turns it into a scale. For the
 *   ordinary folder, whose busiest page is a 9, that is a camera of 2.0.
 *
 *   ⚠️ **It used to be a flat 1.6**, which drew that page at 28.8px, one step under the
 *   map's own 36px node chrome. The step down bought nothing measurable and cost a third of
 *   the canvas: the owner's six-document folder measured **38.4% × 38.7%** of a 1512 window
 *   with ~340px of empty gutter on each side, and the fit tile could not help because the
 *   fit was already against the clamp (inspection 122, S1). The mark may now be exactly a
 *   map node and never wider — the same family, at the same size, rather than a size chosen
 *   to be smaller than it. A folder whose marks are all small comes proportionally closer,
 *   because what is capped is the drawn mark and not the camera.
 *
 *   What this does **not** buy is the canvas. Six marks still cannot cover a 1920 window at
 *   any honest zoom: the scale that would fill 60% of its shorter axis draws that page at
 *   43px, which is the balloon the owner rejected in G2. The fill improves by exactly the
 *   ratio of the two ceilings and no further.
 * - **{@link LIBRARY_ZOOM_MIN}** is whatever keeps a source's square at
 *   {@link MIN_SOURCE_MARK_PX} across. Below that a file stops being a mark and becomes
 *   noise, and a picture that cannot be zoomed out far enough to fit is better honest about
 *   it — the camera clamps and the person pans — than legible at nothing.
 */
export const LIBRARY_MAX_MARK_PX = 36;
/** The smallest a source's square may be drawn, across, in canvas pixels. */
export const MIN_SOURCE_MARK_PX = 3;
/**
 * Mirrors `LIBRARY_SOURCE_RADIUS`. It is repeated rather than imported because the view is
 * the one module in this widget with no model dependency, and `library-graph-view.test.ts`
 * asserts the two agree.
 */
export const SOURCE_MARK_WORLD_RADIUS = 3.5;
/** Mirrors `LIBRARY_PAGE_RADIUS_MAX` — the top of the mark band — on the same terms. */
export const WIDEST_MARK_WORLD_RADIUS = 9;
/** Mirrors `LIBRARY_PAGE_RADIUS_MIN`, the floor of the band a *named* thing is drawn at. */
export const NAMED_MARK_WORLD_RADIUS_MIN = 5;
export const LIBRARY_ZOOM_MIN = MIN_SOURCE_MARK_PX / (SOURCE_MARK_WORLD_RADIUS * 2);

/**
 * The camera's ceiling for a folder whose widest mark is `widestWorldRadius`.
 *
 * Floored at {@link NAMED_MARK_WORLD_RADIUS_MIN} rather than taken raw, because a folder of
 * nothing but files has a widest radius of 3.5 and would otherwise be allowed a camera of
 * 5.1 — 36px squares for files, which is a balloon by another name. The floor is the band's
 * own bottom, so the ceiling is between 2.0 (an ordinary folder) and 3.6 (a folder with no
 * mark above the floor), and never outside it.
 */
export function libraryZoomMax(widestWorldRadius: number): number {
  return LIBRARY_MAX_MARK_PX / (2 * Math.max(NAMED_MARK_WORLD_RADIUS_MIN, widestWorldRadius));
}

/** The ceiling of the ordinary folder — one whose busiest page is at the top of the band. */
export const LIBRARY_ZOOM_MAX = libraryZoomMax(WIDEST_MARK_WORLD_RADIUS);

/**
 * **The zoom at which a file's own name appears.**
 *
 * Sixty pages and three hundred files cannot all be named at once — measured, 288 of the
 * 360 names collide at the fitted scale — and naming the files is the half of that a person
 * has not asked for: the question the home answers is *which write-ups exist*, and a page's
 * name answers it. So a source is a dot until either the person has zoomed in far enough
 * that its neighbourhood is what the screen is about (this), or they have pointed at it, or
 * it belongs to the page they have open.
 *
 * 1.4 is between the fitted scale of the measured fixtures (0.49–2.0) and the ceiling, so
 * the threshold is reachable by a wheel from any of them. The two smallest folders fit
 * *above* it and name their files at rest, which is what the whole picture is about at that
 * order; the sixty- and three-hundred-mark folders fit below it and do not.
 */
export const SOURCE_LABEL_MIN_SCALE = 1.4;

/**
 * Wheel sensitivity: `exp(-pixelDelta × this)`, about 1.32× per 120px notch.
 *
 * The map measured its way to 0.0023 over three rounds (0.0016 → 0.0020 → 0.0023) and
 * this canvas inherits the number rather than starting that search again — a person who
 * has learned the zoom on the map should not have to learn a second one here.
 */
const WHEEL_ZOOM_SENSITIVITY = 0.0023;

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
  maxScale: number = LIBRARY_ZOOM_MAX,
): LibraryGraphView {
  if (!bounds) return { scale: 1, x: 0, y: 0 };
  const spanX = bounds.maxX - bounds.minX;
  const spanY = bounds.maxY - bounds.minY;
  const innerWidth = Math.max(1, box.width - padding * 2);
  const innerHeight = Math.max(1, box.height - padding * 2);
  // A single node, or a row of nodes on one axis, has zero span there. Scaling by it
  // divides by zero; scale 1 centres them instead, which is what a person expects to see.
  const wanted = Math.min(spanX > 0 ? innerWidth / spanX : 1, spanY > 0 ? innerHeight / spanY : 1);
  /*
   * ⚠️ **Clamped, so the fit is a frame and not a magnification.** Uncapped, a folder of six
   * documents on a 1920 window asks for whatever scale spreads six dots across 1800px, and
   * every mark grows with it. Clamped, the picture keeps its own size and the canvas simply
   * has room to spare — which is what six nodes on the map look like too.
   */
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
 * Whether two cameras are the same picture, to within what a person can see.
 *
 * The fit tile's whole job is to put the picture back in the frame, so the one thing it may
 * never do is claim to have done something when the frame is already where it is going —
 * the affordance measured as a **pixel-identical frame** in inspection 122 (S1). The surface
 * asks this and stops offering the press; the thresholds are half a pixel of centre travel
 * at the current scale and a fifth of a percent of zoom, both under one device pixel on
 * every window in the matrix.
 */
export function isSameView(view: LibraryGraphView, target: LibraryGraphView): boolean {
  if (Math.abs(view.scale - target.scale) / Math.max(1e-6, target.scale) > 0.002) return false;
  const travel = Math.hypot(view.x - target.x, view.y - target.y) * target.scale;
  return travel <= 0.5;
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
