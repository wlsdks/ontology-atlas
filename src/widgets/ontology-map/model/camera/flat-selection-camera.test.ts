import { describe, expect, it } from "vitest";
import {
  SELECTION_NUDGE_MARGIN_PX,
  deselectCamera,
  recordSelectionCamera,
  selectionNudgeTarget,
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
