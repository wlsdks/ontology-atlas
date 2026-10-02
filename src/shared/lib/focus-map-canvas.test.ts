import { afterEach, describe, expect, it } from "vitest";
import { focusMapCanvasWhenReady, MAP_CANVAS_SURFACE_ROLE } from "./focus-map-canvas";

function canvasWith(attribute: string): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.tabIndex = 0;
  canvas.setAttribute(attribute, MAP_CANVAS_SURFACE_ROLE);
  document.body.append(canvas);
  return canvas;
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("focusMapCanvasWhenReady", () => {
  it.each(["data-surface-role", "data-role"])("focuses a canvas marked with %s", (attribute) => {
    const canvas = canvasWith(attribute);
    focusMapCanvasWhenReady(1, true);
    expect(document.activeElement).toBe(canvas);
    expect(canvas.dataset.keyboardFocus).toBe("true");
  });
});
