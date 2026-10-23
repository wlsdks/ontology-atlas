import { describe, expect, it } from "vitest";
import {
  measureCanvasInsets,
  collectCanvasObstacles,
  computeFreeArea,
  SIDE_PANEL_HEIGHT_RATIO,
  type Rect,
} from "./free-area";

const CANVAS: Rect = { x: 64, y: 0, width: 1448, height: 982 };
const RIGHT_POPOVER: Rect = { x: 1128, y: 32, width: 352, height: 813 };

describe("computeFreeArea", () => {
  it("the canvas is unchanged when nothing covers it", () => {
    expect(computeFreeArea(CANVAS, [])).toEqual(CANVAS);
  });

  it("subtracts the right popover (measured geometry)", () => {
    const free = computeFreeArea(CANVAS, [RIGHT_POPOVER]);
    expect(free.x).toBe(64);
    expect(free.width).toBe(1128 - 64);
    // A side panel does not touch the height.
    expect(free.height).toBe(982);
  });

  it("subtracts an explicit desktop inspector from the free area even when shorter than 60%", () => {
    const shortInspector: Rect = {
      x: 1128,
      y: 32,
      width: 352,
      height: 456,
      cameraObstacle: "side-panel",
    };

    expect(computeFreeArea(CANVAS, [shortInspector])).toEqual({
      x: 64,
      y: 0,
      width: 1128 - 64,
      height: 982,
    });
  });

  it("does not subtract an explicit full-width mobile sheet as a left or right panel", () => {
    const mobileSheet: Rect = {
      x: 76,
      y: 72,
      width: 1400,
      height: 456,
      cameraObstacle: "side-panel",
    };

    const free = computeFreeArea(CANVAS, [mobileSheet]);
    // The horizontal half is what this case has always guarded: a full-width sheet
    // is never a left or right inset.
    expect(free.x).toBe(CANVAS.x);
    expect(free.width).toBe(CANVAS.width);
  });

  it("subtracts a full-width sheet toward the edge it is attached to, even when explicit", () => {
    const bottomSheet: Rect = {
      x: 76,
      y: 526,
      width: 1400,
      height: 456,
      cameraObstacle: "side-panel",
    };

    const free = computeFreeArea(CANVAS, [bottomSheet]);
    expect(free.y).toBe(CANVAS.y);
    expect(free.height).toBe(526 - CANVAS.y);
    expect(free.width).toBe(CANVAS.width);
  });

  it("subtracts the left panel from the left", () => {
    const left: Rect = { x: 64, y: 0, width: 320, height: 900 };
    const free = computeFreeArea(CANVAS, [left]);
    expect(free.x).toBe(384);
    expect(free.width).toBe(1512 - 384);
  });

  it("subtracts both side panels", () => {
    const left: Rect = { x: 64, y: 0, width: 320, height: 900 };
    const free = computeFreeArea(CANVAS, [left, RIGHT_POPOVER]);
    expect(free.x).toBe(384);
    expect(free.width).toBe(1128 - 384);
  });

  it("subtracts the top bar from the top", () => {
    const bar: Rect = { x: 64, y: 0, width: 1448, height: 96 };
    const free = computeFreeArea(CANVAS, [bar]);
    expect(free.y).toBe(96);
    expect(free.height).toBe(982 - 96);
    expect(free.width).toBe(1448);
  });

  /**
   * Something covering the whole screen (a sheet or scrim) is not subtracted.
   * Subtracting one leaves no area at all, and then «the centre» is undefined — and
   * with a sheet up it is not a moment to be moving the camera anyway.
   */
  it("does not subtract a scrim that covers everything", () => {
    const scrim: Rect = { x: 64, y: 0, width: 1448, height: 982 };
    expect(computeFreeArea(CANVAS, [scrim])).toEqual(CANVAS);
  });

  it("does not subtract small islands (chips, tooltips)", () => {
    const chip: Rect = { x: 600, y: 400, width: 120, height: 40 };
    expect(computeFreeArea(CANVAS, [chip])).toEqual(CANVAS);
  });

  it("ignores what does not overlap the canvas", () => {
    const elsewhere: Rect = { x: 2000, y: 0, width: 300, height: 900 };
    expect(computeFreeArea(CANVAS, [elsewhere])).toEqual(CANVAS);
  });

  /**
   * Two side panels overshooting each other so the area inverts.
   *
   * ⚠️ The widths must not be generous — the moment a rectangle passes 60% of the
   * canvas width it counts as «a side panel and a top bar» and is **not subtracted
   * at all** (the module's rule). This case was first written with w900 (= 0.62) and
   * tripped that rule: the case was wrong, not the code.
   */
  it("falls back to the canvas when two vertical panels overlap and invert the area", () => {
    const left: Rect = { x: 64, y: 0, width: 700, height: 900 };
    const rightPanel: Rect = { x: 600, y: 0, width: 500, height: 900 };
    expect(computeFreeArea(CANVAS, [left, rightPanel])).toEqual(CANVAS);
  });

  it("the vertical-panel ratio separates the two measured groups", () => {
    // popover 813/982 = 0.83 → a side panel · top toolbar ~96/982 = 0.10 → not one
    expect(RIGHT_POPOVER.height / CANVAS.height).toBeGreaterThan(SIDE_PANEL_HEIGHT_RATIO);
    expect(96 / CANVAS.height).toBeLessThan(SIDE_PANEL_HEIGHT_RATIO);
  });
});

describe("measureCanvasInsets", () => {
  /**
   * A minimal DOM stand-in — only what `collectCanvasObstacles` uses. jsdom has no
   * layout, so every `getBoundingClientRect` returns 0; without planting those
   * values this test would **measure the environment** (a trap this file has already
   * fallen into once).
   */
  const fakeCanvas = (
    panels: (Omit<Rect, "cameraObstacle"> & { hidden?: boolean; cameraObstacle?: "side-panel" | "none"; modal?: boolean })[],
  ) => {
    const make = (
      r: Omit<Rect, "cameraObstacle">,
      hidden?: boolean,
      cameraObstacle?: "side-panel" | "none",
      modal?: boolean,
    ) => {
      const el = document.createElement("div");
      el.getBoundingClientRect = (() => ({
        x: r.x, y: r.y, width: r.width, height: r.height,
        left: r.x, top: r.y, right: r.x + r.width, bottom: r.y + r.height,
        toJSON: () => ({}),
      })) as typeof el.getBoundingClientRect;
      if (hidden) el.style.display = "none";
      if (cameraObstacle) el.dataset.topologyCameraObstacle = cameraObstacle;
      if (modal) el.setAttribute("aria-modal", "true");
      return el;
    };
    document.body.innerHTML = "";
    const canvas = make({ x: 64, y: 0, width: 1448, height: 982 });
    document.body.append(canvas);
    for (const p of panels) {
      document.body.append(make(p, p.hidden, p.cameraObstacle, p.modal));
    }
    return canvas;
  };

  it("keeps explicit side panels inside a generic full-canvas wrapper in measured free space", () => {
    const left: Rect = { x: 64, y: 148, width: 324, height: 456, cameraObstacle: "side-panel" };
    const right: Rect = { x: 1128, y: 32, width: 352, height: 456, cameraObstacle: "side-panel" };
    const canvas = fakeCanvas([CANVAS, left, right]);
    const wrapper = canvas.nextElementSibling!;
    const leftPanel = wrapper.nextElementSibling!;
    const rightPanel = leftPanel.nextElementSibling!;
    wrapper.append(leftPanel, rightPanel);
    const obstacles = collectCanvasObstacles(canvas, CANVAS);
    expect(obstacles).toContainEqual(left);
    expect(obstacles).toContainEqual(right);
    expect(measureCanvasInsets(canvas, CANVAS)).toEqual({ left: 324, right: 384 });
    expect(computeFreeArea(CANVAS, obstacles)).toEqual({ x: 388, y: 0, width: 740, height: 982 });
  });

  it("counts nested explicit side-panel declarations once without growing their edge inset", () => {
    const left: Rect = { x: 64, y: 148, width: 324, height: 456, cameraObstacle: "side-panel" };
    const nested: Rect = { x: 80, y: 164, width: 280, height: 400, cameraObstacle: "side-panel" };
    const canvas = fakeCanvas([CANVAS, left, nested]);
    const wrapper = canvas.nextElementSibling!;
    const panel = wrapper.nextElementSibling!;
    panel.append(panel.nextElementSibling!);
    wrapper.append(panel);
    const obstacles = collectCanvasObstacles(canvas, CANVAS);
    expect(obstacles.filter((obstacle) => obstacle.cameraObstacle === "side-panel")).toEqual([left]);
    expect(measureCanvasInsets(canvas, CANVAS)).toEqual({ left: 324, right: 0 });
  });

  it("measures the right popover as a right inset (measured geometry)", () => {
    const canvas = fakeCanvas([RIGHT_POPOVER]);
    const insets = measureCanvasInsets(canvas, CANVAS);
    // canvas right edge (1512) − popover left (1128) = 384 (matching the measurement)
    expect(insets).toEqual({ left: 0, right: 384 });
  });

  it("measures an explicit short inspector as a right camera obstacle too", () => {
    const canvas = fakeCanvas([
      {
        x: 1128,
        y: 32,
        width: 352,
        height: 456,
        cameraObstacle: "side-panel",
      },
    ]);

    expect(measureCanvasInsets(canvas, CANVAS)).toEqual({ left: 0, right: 384 });
  });

  it("does not mistake an explicit mobile sheet spanning the screen for a side panel", () => {
    const canvas = fakeCanvas([
      {
        x: 76,
        y: 72,
        width: 1400,
        height: 456,
        cameraObstacle: "side-panel",
      },
    ]);

    expect(measureCanvasInsets(canvas, CANVAS)).toEqual({ left: 0, right: 0 });
  });

  it("measures the left panel as a left inset", () => {
    const canvas = fakeCanvas([{ x: 64, y: 0, width: 324, height: 900 }]);
    expect(measureCanvasInsets(canvas, CANVAS)).toEqual({ left: 324, right: 0 });
  });

  it("does not count a modal sheet as a side inset, the frame where the search palette disappears", () => {
    const canvas = fakeCanvas([{ x: 400, y: 64, width: 576, height: 640, modal: true }, RIGHT_POPOVER]);
    expect(measureCanvasInsets(canvas, CANVAS)).toEqual({ left: 0, right: 384 });
  });

  it("does not count a transient surface that declares itself a non-obstacle", () => {
    const canvas = fakeCanvas([{ x: 64, y: 0, width: 324, height: 900, cameraObstacle: "none" }]);
    expect(measureCanvasInsets(canvas, CANVAS)).toEqual({ left: 0, right: 0 });
  });

  it("does not count a hidden panel", () => {
    const canvas = fakeCanvas([{ ...RIGHT_POPOVER, hidden: true }]);
    expect(measureCanvasInsets(canvas, CANVAS)).toEqual({ left: 0, right: 0 });
  });

  it("top and bottom bars do not leak into the left and right insets", () => {
    const canvas = fakeCanvas([{ x: 64, y: 0, width: 1448, height: 96 }]);
    expect(measureCanvasInsets(canvas, CANVAS)).toEqual({ left: 0, right: 0 });
  });
});
