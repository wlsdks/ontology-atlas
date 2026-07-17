import { describe, expect, it } from "vitest";

import { normalizeWheelDeltaY, WHEEL_LINE_HEIGHT_PX } from "./wheel";

describe("normalizeWheelDeltaY", () => {
  it("passes pixel-mode (deltaMode 0) deltas through unchanged", () => {
    expect(normalizeWheelDeltaY(120, 0, 900)).toBe(120);
    expect(normalizeWheelDeltaY(-48, 0, 900)).toBe(-48);
  });

  it("scales line-mode (deltaMode 1) deltas up by the line height", () => {
    // A mouse notch commonly reports deltaMode=1, deltaY≈3 — under the old
    // raw path that was near-zero zoom (the owner's '휠 확대 안 됨' bug).
    expect(normalizeWheelDeltaY(3, 1, 900)).toBe(3 * WHEEL_LINE_HEIGHT_PX);
    expect(normalizeWheelDeltaY(-1, 1, 900)).toBe(-WHEEL_LINE_HEIGHT_PX);
  });

  it("scales page-mode (deltaMode 2) deltas by the viewport height", () => {
    expect(normalizeWheelDeltaY(1, 2, 800)).toBe(800);
    expect(normalizeWheelDeltaY(-0.5, 2, 800)).toBe(-400);
  });

  it("keeps a line-mode notch and a pixel-mode notch in the same order of magnitude", () => {
    const line = Math.abs(normalizeWheelDeltaY(3, 1, 900));
    const pixel = Math.abs(normalizeWheelDeltaY(120, 0, 900));
    // both should land in the tens-to-low-hundreds of px, not 3 vs 120
    expect(line).toBeGreaterThan(pixel * 0.2);
    expect(line).toBeLessThan(pixel * 2);
  });
});
