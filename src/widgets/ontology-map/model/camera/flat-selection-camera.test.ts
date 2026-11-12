import { describe, expect, it } from "vitest";
import {
  SELECTION_NUDGE_MARGIN_PX,
  deselectCamera,
  recordSelectionCamera,
  selectionFrameTarget,
  selectionNudgeTarget,
  type FramedMark,
  type FreeMapRect,
} from "./flat-selection-camera";

const view = { tx: 0, ty: 0, tscale: 1 };
const insets = { left: 300, right: 400 };

describe("flat selection camera", () => {
  it("keeps a selected outward branch clear of the inspector without changing zoom", () => {
    const nudge = selectionNudgeTarget(view, { x: 250 }, 1600, insets, { left: 100, right: 360 })!;
    expect(nudge.tscale).toBe(1);
    expect(nudge.ty).toBe(0);
    expect(250 - nudge.tx + 800 + 360).toBe(1200);
  });
  it("slides only sideways, at the same scale, and only when the panel would cover the node", () => {
    expect(selectionNudgeTarget(view, { x: 0 }, 1600, insets)).toBeNull();
    const nudge = selectionNudgeTarget(view, { x: 600 }, 1600, insets)!;
    expect(nudge.ty).toBe(0);
    expect(nudge.tscale).toBe(1);
    expect((600 - nudge.tx) * nudge.tscale + 800).toBe(1600 - insets.right - SELECTION_NUDGE_MARGIN_PX);
    expect(selectionNudgeTarget(view, { x: 0 }, 600, insets)).toBeNull();
  });

  it("a chain of selections returns to the view before the first one", () => {
    const first = recordSelectionCamera(null, { slug: "a", framed: false, current: view, landed: { tx: 50, ty: 0, tscale: 1 }, gesture: 0 });
    const linked = recordSelectionCamera(first, { slug: "b", framed: true, current: { tx: 50, ty: 0, tscale: 1 }, landed: { tx: 90, ty: 10, tscale: 1.6 }, gesture: 0 });
    expect(deselectCamera(linked, { tx: 90, ty: 10, tscale: 1.6 }, 0, false)).toEqual({ kind: "return", target: view });
  });

  it("a view the reader moved is never taken back, framed or not", () => {
    const framed = recordSelectionCamera(null, { slug: "a", framed: true, current: view, landed: { tx: 80, ty: 20, tscale: 1.6 }, gesture: 3 });
    expect(deselectCamera(framed, { tx: 80, ty: 20, tscale: 1.9 }, 3, false)).toEqual({ kind: "stay" });
    expect(deselectCamera(framed, { tx: 80, ty: 20, tscale: 1.6 }, 4, false)).toEqual({ kind: "stay" });
  });

  it("a selection after a reader move returns to that moved view, not to an older one", () => {
    const first = recordSelectionCamera(null, { slug: "a", framed: false, current: view, landed: view, gesture: 0 });
    const moved = { tx: 200, ty: 0, tscale: 1 };
    const linked = recordSelectionCamera(first, { slug: "b", framed: true, current: moved, landed: { tx: 90, ty: 0, tscale: 1.6 }, gesture: 1 });
    expect(deselectCamera(linked, { tx: 90, ty: 0, tscale: 1.6 }, 1, false)).toEqual({ kind: "return", target: moved });
  });

  it("a click that moved nothing leaves the camera alone, and an arrival framing without memory returns to the overview only if untouched", () => {
    const clicked = recordSelectionCamera(null, { slug: "a", framed: false, current: view, landed: view, gesture: 0 });
    expect(deselectCamera(clicked, view, 0, false)).toEqual({ kind: "stay" });
    expect(deselectCamera(null, view, 0, false)).toEqual({ kind: "overview" });
    expect(deselectCamera(null, view, 0, true)).toEqual({ kind: "stay" });
  });
});

describe("flat selection framing", () => {
  const viewport = { width: 1920, height: 1080 };
  const free: FreeMapRect = { minX: 390, maxX: 1530, minY: 148, maxY: 984 };
  const margin = 24;
  const mark = (x: number, y: number, half = 60): FramedMark => ({ x, y, box: { minX: -half, maxX: half, minY: -20, maxY: 20 } });
  const screen = (camera: { tx: number; ty: number; tscale: number }, m: FramedMark) => ({
    minX: (m.x - camera.tx) * camera.tscale + viewport.width / 2 + m.box.minX,
    maxX: (m.x - camera.tx) * camera.tscale + viewport.width / 2 + m.box.maxX,
    minY: (m.y - camera.ty) * camera.tscale + viewport.height / 2 + m.box.minY,
    maxY: (m.y - camera.ty) * camera.tscale + viewport.height / 2 + m.box.maxY,
  });
  const inside = (camera: { tx: number; ty: number; tscale: number }, marks: readonly FramedMark[]) => marks.every((m) => {
    const b = screen(camera, m);
    return b.minX >= free.minX + margin - 1e-6 && b.maxX <= free.maxX - margin + 1e-6 && b.minY >= free.minY + margin - 1e-6 && b.maxY <= free.maxY - margin + 1e-6;
  });

  it("pans the selection and its neighbours out from under the panel at the same zoom, by the least slide", () => {
    const near = [mark(500, 0), mark(560, 30), mark(620, -40)];
    const target = selectionFrameTarget(view, [near], viewport, free, margin, 0.5)!;
    expect(target.tscale).toBe(1);
    expect(inside(target, near)).toBe(true);
    expect(screen(target, near[2]!).maxX).toBeCloseTo(free.maxX - margin, 6);
    expect(selectionFrameTarget(target, [near], viewport, free, margin, 0.5)).toBeNull();
  });

  it("frames the whole reach when it fits at the current zoom, and only the near set when it does not", () => {
    const near = [mark(100, 0), mark(160, 30)];
    const far = mark(-500, 0);
    const whole = selectionFrameTarget(view, [[...near, far], near], viewport, free, margin, 0.5)!;
    expect(whole.tscale).toBe(1);
    expect(inside(whole, [...near, far])).toBe(true);
    const distant = mark(-2_000, 0);
    expect(selectionFrameTarget(view, [[...near, distant], near], viewport, free, margin, 0.5)).toBeNull();
  });

  it("zooms out only as far as the near set needs, never below the floor and never in", () => {
    const near = [mark(0, 0), mark(1_400, 0)];
    const target = selectionFrameTarget(view, [near], viewport, free, margin, 0.5)!;
    expect(target.tscale).toBeLessThan(1);
    expect(target.tscale).toBeGreaterThan(0.5);
    expect(inside(target, near)).toBe(true);
    expect(inside({ ...target, tscale: target.tscale * 1.01 }, near)).toBe(false);
    const huge = [mark(0, 0), mark(9_000, 0)];
    const floored = selectionFrameTarget(view, [huge], viewport, free, margin, 0.5)!;
    expect(floored.tscale).toBe(0.5);
    expect(inside(floored, [huge[0]!])).toBe(true);
    const zoomedOut = { tx: 0, ty: 0, tscale: 0.3 };
    expect(selectionFrameTarget(zoomedOut, [huge], viewport, free, margin, 0.5)!.tscale).toBe(0.3);
  });

  it("zooms in about the selection only when the panned view does not read clear, to the least clear zoom, capped by its reach and the fit", () => {
    const near = [mark(500, 0), mark(560, 30), mark(620, -40)];
    const zoomIn = (maxScale: number, scoreAt: (s: number) => number[]) => ({ maxScale, scoreAt, marksAt: () => near });
    const clearFrom = (from: number) => zoomIn(4, (s) => [s >= from ? 1 : 0]);
    expect(selectionFrameTarget({ tx: 520, ty: 0, tscale: 1 }, [near], viewport, free, margin, 0.5, clearFrom(1))).toBeNull();
    const zoomed = selectionFrameTarget(view, [near], viewport, free, margin, 0.5, clearFrom(1.5))!;
    expect(zoomed.tscale).toBeGreaterThanOrEqual(1.5);
    expect(zoomed.tscale).toBeLessThan(1.5 * 2 ** (1 / 8));
    expect(inside(zoomed, near)).toBe(true);
    const ever = (s: number) => [s];
    const capped = selectionFrameTarget(view, [near], viewport, free, margin, 0.5, zoomIn(4, ever))!;
    expect(inside(capped, near)).toBe(true);
    expect(inside({ ...capped, tscale: capped.tscale * 1.02 }, near)).toBe(false);
    expect(selectionFrameTarget(view, [near], viewport, free, margin, 0.5, zoomIn(1.2, ever))!.tscale).toBeCloseTo(1.2, 9);
  });

  it("takes the smallest zoom that reads best and spends no zoom that reads no better", () => {
    const near = [mark(500, 0), mark(560, 30), mark(620, -40)];
    const zoomIn = (scoreAt: (s: number) => number[]) => ({ maxScale: 4, scoreAt, marksAt: () => near });
    const twelveOfThirteen = selectionFrameTarget(view, [near], viewport, free, margin, 0.5, zoomIn((s) => [1, 1, s >= 1.3 ? 12 : 11]))!;
    expect(twelveOfThirteen.tscale).toBeGreaterThanOrEqual(1.3);
    expect(twelveOfThirteen.tscale).toBeLessThan(1.3 * 2 ** (1 / 8));
    const apartFirst = selectionFrameTarget(view, [near], viewport, free, margin, 0.5, zoomIn((s) => (s >= 1.6 ? [1, 0, 3] : [0, 1, 13])))!;
    expect(apartFirst.tscale).toBeGreaterThanOrEqual(1.6);
    expect(apartFirst.tscale).toBeLessThan(1.6 * 2 ** (1 / 8));
    const flat = selectionFrameTarget(view, [near], viewport, free, margin, 0.5, zoomIn(() => [0, 0, 12]));
    expect(flat?.tscale ?? view.tscale).toBe(view.tscale);
  });
});
