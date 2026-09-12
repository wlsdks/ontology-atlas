// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  fitView,
  isSameView,
  isWheelZoomIntent,
  LIBRARY_MAX_MARK_PX,
  LIBRARY_ZOOM_MAX,
  LIBRARY_ZOOM_MIN,
  libraryZoomMax,
  MIN_SOURCE_MARK_PX,
  NAMED_MARK_WORLD_RADIUS_MIN,
  SOURCE_MARK_WORLD_RADIUS,
  WIDEST_MARK_WORLD_RADIUS,
  panView,
  scaleBounds,
  screenToWorld,
  wheelPixelDelta,
  wheelZoomFactor,
  worldToScreen,
  zoomViewAbout,
} from "./library-graph-view";

const BOX = { width: 1000, height: 600 };

describe("the library graph's view", () => {
  it("round-trips a point between the world and the screen", () => {
    const view = { scale: 1.7, x: 40, y: -12 };
    const world = { x: 133, y: 88 };
    const screen = worldToScreen(world, view, BOX);
    const back = screenToWorld(screen, view, BOX);
    expect(back.x).toBeCloseTo(world.x, 9);
    expect(back.y).toBeCloseTo(world.y, 9);
  });

  it("fits the picture with one scale for both axes", () => {
    const view = fitView({ minX: -600, maxX: 600, minY: -150, maxY: 150 }, BOX, 26);
    // 1200 world units across a 948px inner box is 0.79; 300 down a 548px box is 1.83.
    // The smaller wins, or the picture would be stretched.
    expect(view.scale).toBeCloseTo(948 / 1200, 6);
    expect(view.x).toBe(0);
    expect(view.y).toBe(0);
  });

  /**
   * **The fit frames, it does not magnify** (2026-09-12, G2). A folder of six documents on a
   * 1920 window asks for whatever scale spreads six dots across the width, and the marks are
   * a fixed world size, so an unclamped fit hands their drawn size straight back to the
   * window — which is the picture the owner rejected.
   */
  it("clamps the fit at both ends rather than magnifying a small folder", () => {
    const tiny = fitView({ minX: -50, maxX: 50, minY: -30, maxY: 30 }, BOX, 64);
    expect(tiny.scale).toBe(LIBRARY_ZOOM_MAX);
    const huge = fitView({ minX: -4000, maxX: 4000, minY: -2000, maxY: 2000 }, BOX, 64);
    expect(huge.scale).toBe(LIBRARY_ZOOM_MIN);
    // Clamped low, the picture is wider than the canvas and the person pans — which is
    // honest, where a source mark under three pixels across is not.
    expect(SOURCE_MARK_WORLD_RADIUS * 2 * huge.scale).toBeCloseTo(MIN_SOURCE_MARK_PX, 6);
  });

  it("centres a single node rather than dividing by a zero span", () => {
    const view = fitView({ minX: 7, maxX: 7, minY: -3, maxY: -3 }, BOX, 26);
    expect(view).toEqual({ scale: 1, x: 7, y: -3 });
    expect(worldToScreen({ x: 7, y: -3 }, view, BOX)).toEqual({ x: 500, y: 300 });
  });

  it("falls back to an identity view when there is no picture to fit", () => {
    expect(fitView(null, BOX, 26)).toEqual({ scale: 1, x: 0, y: 0 });
  });

  /**
   * The anchor is the whole of what makes a wheel zoom feel like a magnifier. Whatever is
   * under the pointer has to still be under the pointer afterwards, at every scale.
   */
  it("keeps whatever is under the pointer under the pointer", () => {
    const view = { scale: 1, x: 0, y: 0 };
    const pointer = { x: 780, y: 140 };
    const before = screenToWorld(pointer, view, BOX);
    for (const factor of [1.32, 0.76, 2.4]) {
      const next = zoomViewAbout(view, BOX, pointer, factor, { min: 0.2, max: 8 });
      const after = worldToScreen(before, next, BOX);
      expect(after.x).toBeCloseTo(pointer.x, 6);
      expect(after.y).toBeCloseTo(pointer.y, 6);
    }
  });

  it("stops at the bounds instead of zooming forever", () => {
    const bounds = scaleBounds();
    // Absolute, not fit-relative: a mark is a fixed world size, so the camera is the only
    // thing deciding how big it is drawn and a fit-relative ceiling would hand that back to
    // the window.
    expect(bounds).toEqual({ min: LIBRARY_ZOOM_MIN, max: LIBRARY_ZOOM_MAX });
    // A source's square never drops under three canvas pixels across.
    expect(SOURCE_MARK_WORLD_RADIUS * 2 * bounds.min).toBeCloseTo(MIN_SOURCE_MARK_PX, 6);
    const wide = zoomViewAbout({ scale: 1, x: 0, y: 0 }, BOX, { x: 10, y: 10 }, 0.01, bounds);
    expect(wide.scale).toBe(LIBRARY_ZOOM_MIN);
    const close = zoomViewAbout({ scale: 1, x: 0, y: 0 }, BOX, { x: 10, y: 10 }, 100, bounds);
    expect(close.scale).toBe(LIBRARY_ZOOM_MAX);
    // At the bound the view is returned unchanged rather than re-anchored by a no-op zoom,
    // which would drift the centre a hair on every further notch.
    const pinned = zoomViewAbout(close, BOX, { x: 10, y: 10 }, 100, bounds);
    expect(pinned).toBe(close);
  });

  /**
   * **The ceiling is a drawn mark, not a number of times.** A page at the top of the band is
   * drawn at exactly a map node's 36px and never wider; a folder whose marks are all at the
   * band's floor is allowed closer, because what is capped is the mark.
   */
  it("states the ceiling as the widest mark a folder may draw", () => {
    expect(WIDEST_MARK_WORLD_RADIUS * 2 * libraryZoomMax(WIDEST_MARK_WORLD_RADIUS)).toBeCloseTo(
      LIBRARY_MAX_MARK_PX,
      6,
    );
    expect(LIBRARY_ZOOM_MAX).toBe(libraryZoomMax(WIDEST_MARK_WORLD_RADIUS));
    const quiet = libraryZoomMax(NAMED_MARK_WORLD_RADIUS_MIN);
    expect(quiet).toBeGreaterThan(LIBRARY_ZOOM_MAX);
    // A folder of nothing but files does not get 36px squares: the floor of the band a
    // named thing is drawn at is the smallest radius the ceiling is ever computed from.
    expect(libraryZoomMax(SOURCE_MARK_WORLD_RADIUS)).toBe(quiet);
    // And the fit obeys whichever ceiling it is handed.
    const tiny = { minX: -50, maxX: 50, minY: -30, maxY: 30 };
    expect(fitView(tiny, BOX, 64, quiet).scale).toBe(quiet);
    expect(fitView(tiny, BOX, 64).scale).toBe(LIBRARY_ZOOM_MAX);
  });

  /**
   * **What the fit tile reads before it offers a press.** A press that could only repaint
   * the same pixels is the affordance inspection 122 measured as a pixel-identical frame.
   */
  it("tells a camera that is already the fit from one that is not", () => {
    const fit = { scale: 1.6, x: 40, y: -12 };
    expect(isSameView(fit, fit)).toBe(true);
    // A quarter of a pixel of travel at this scale is not a picture anyone can see move.
    expect(isSameView({ ...fit, x: fit.x + 0.25 / fit.scale }, fit)).toBe(true);
    // Four pixels is.
    expect(isSameView({ ...fit, x: fit.x + 4 / fit.scale }, fit)).toBe(false);
    expect(isSameView({ ...fit, scale: 1.2 }, fit)).toBe(false);
  });

  it("pans by the screen delta divided by the scale, so the hand tracks the picture", () => {
    const view = { scale: 2, x: 0, y: 0 };
    const next = panView(view, { x: 40, y: -20 });
    expect(next).toEqual({ scale: 2, x: -20, y: 10 });
    // Dragging right moves the picture right: the point that was at the centre is now 40px
    // to the right of it.
    expect(worldToScreen({ x: 0, y: 0 }, next, BOX)).toEqual({ x: 540, y: 280 });
  });

  it("normalises a line-mode wheel, so a mouse zooms like a trackpad", () => {
    expect(wheelPixelDelta({ deltaY: 3, deltaMode: 1 }, 900)).toBe(48);
    expect(wheelPixelDelta({ deltaY: 120, deltaMode: 0 }, 900)).toBe(120);
    expect(wheelPixelDelta({ deltaY: 1, deltaMode: 2 }, 900)).toBe(900);
  });

  it("ignores trackpad tremor but never ignores a pinch", () => {
    expect(isWheelZoomIntent(2, false)).toBe(false);
    expect(isWheelZoomIntent(2, true)).toBe(true);
    expect(isWheelZoomIntent(-9, false)).toBe(true);
  });

  it("zooms in on a negative delta and out on a positive one", () => {
    expect(wheelZoomFactor(-120)).toBeGreaterThan(1);
    expect(wheelZoomFactor(120)).toBeLessThan(1);
    // Symmetric: a notch out then a notch in returns to where it started.
    expect(wheelZoomFactor(120) * wheelZoomFactor(-120)).toBeCloseTo(1, 9);
  });
});
