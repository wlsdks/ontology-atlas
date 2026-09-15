import { describe, expect, it } from "vitest";

import { galaxyInspectionTarget } from "./galaxy-inspection-camera";

const viewport = { width: 1448, height: 900 };
const canvasRect = { x: 64, y: 0, ...viewport };

describe("galaxyInspectionTarget", () => {
  it("centres an already visible star in the free canvas at the bounded focus zoom", () => {
    const camera = { tx: 0, ty: 0, tscale: 2 };
    expect(
      galaxyInspectionTarget({
        camera,
        node: { x: 0, y: 0 },
        viewport,
        canvasRect,
        freeArea: { x: 64, y: 0, width: 1064, height: 900 },
        targetScale: 2.6,
      }),
    ).toEqual({ tx: 192 / 2.6, ty: 0, tscale: 2.6 });
  });

  it("brings a covered right-edge star to the free-canvas centre", () => {
    const camera = { tx: 0, ty: 0, tscale: 1 };
    const target = galaxyInspectionTarget({
      camera,
      node: { x: 462, y: 0 }, // screen x 1,250 inside the 1,128px panel
      viewport,
      canvasRect,
      freeArea: { x: 64, y: 0, width: 1064, height: 900 },
      targetScale: 1.2,
    });
    expect(target).toEqual({ tx: 622, ty: 0, tscale: 1.2 });
  });

  it("centres above a bottom sheet on a narrow viewport", () => {
    const target = galaxyInspectionTarget({
      camera: { tx: 0, ty: 0, tscale: 0.8 },
      node: { x: 0, y: 350 },
      viewport: { width: 390, height: 844 },
      canvasRect: { x: 0, y: 0, width: 390, height: 844 },
      freeArea: { x: 0, y: 0, width: 390, height: 520 },
      targetScale: 1.1,
    });
    expect(target.tscale).toBe(1.1);
    expect(target.ty).toBeGreaterThan(0);
  });

  it("never zooms out a camera the person already brought closer", () => {
    const target = galaxyInspectionTarget({
      camera: { tx: -40, ty: 12, tscale: 2.4 },
      node: { x: 10, y: -20 },
      viewport,
      canvasRect,
      freeArea: { x: 64, y: 0, width: 1064, height: 900 },
      targetScale: 1.2,
    });
    expect(target.tscale).toBe(2.4);
  });
});
