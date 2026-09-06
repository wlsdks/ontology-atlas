// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  fitView,
  isWheelZoomIntent,
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
    const view = fitView({ minX: -200, maxX: 200, minY: -50, maxY: 50 }, BOX, 26);
    // 400 world units across a 948px inner box is 2.37; 100 down a 548px box is 5.48.
    // The smaller wins, or the picture would be stretched.
    expect(view.scale).toBeCloseTo(948 / 400, 6);
    expect(view.x).toBe(0);
    expect(view.y).toBe(0);
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
    const bounds = scaleBounds(2);
    expect(bounds).toEqual({ min: 1, max: 8 });
    const wide = zoomViewAbout({ scale: 2, x: 0, y: 0 }, BOX, { x: 10, y: 10 }, 0.01, bounds);
    expect(wide.scale).toBe(1);
    const close = zoomViewAbout({ scale: 2, x: 0, y: 0 }, BOX, { x: 10, y: 10 }, 100, bounds);
    expect(close.scale).toBe(8);
    // At the bound the view is returned unchanged rather than re-anchored by a no-op zoom,
    // which would drift the centre a hair on every further notch.
    const pinned = zoomViewAbout(close, BOX, { x: 10, y: 10 }, 100, bounds);
    expect(pinned).toBe(close);
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
