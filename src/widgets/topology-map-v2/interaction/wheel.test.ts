import { describe, expect, it } from "vitest";

import { computeWheelZoomFactor, normalizeWheelDeltaY, shouldIgnoreWheelGlide, WHEEL_LINE_HEIGHT_PX, WHEEL_ZOOM_SENSITIVITY } from "./wheel";

describe("normalizeWheelDeltaY", () => {
  it("passes pixel-mode (deltaMode 0) deltas through unchanged", () => {
    expect(normalizeWheelDeltaY(120, 0, 900)).toBe(120);
    expect(normalizeWheelDeltaY(-48, 0, 900)).toBe(-48);
  });

  it("scales line-mode (deltaMode 1) deltas up by the line height", () => {
    // A mouse notch commonly reports deltaMode=1, deltaY≈3 — under the old raw
    // path that was near-zero zoom (the owner's *"Wheel zoom not working"* bug — the wheel
    // does not zoom).
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

/**
 * Owner feedback — zoom in/out felt slow/sluggish. Sensitivity upped from
 * 0.0016 (~1.21x per a 120px notch) to 0.0020 (~1.27x per notch) — sits
 * between d3-zoom's convention (~1.18x/notch) and Leaflet 2.0's, per the
 * design round's spec.
 */
describe("computeWheelZoomFactor", () => {
  it("uses the 0.0023 sensitivity constant (0.0016→0.0020→0.0023, owner: zoom felt slow)", () => {
    expect(WHEEL_ZOOM_SENSITIVITY).toBeCloseTo(0.0023, 6);
  });

  it("yields ≈1.32x zoom-in for a standard 120px notch (scroll up = negative deltaY)", () => {
    const factor = computeWheelZoomFactor(-120);
    expect(factor).toBeCloseTo(Math.exp(120 * 0.0023), 6);
    expect(factor).toBeGreaterThan(1.18); // above d3-zoom's own per-notch ratio
  });

  it("zoom-out (positive deltaY) is the exact reciprocal of the same-magnitude zoom-in", () => {
    const zoomIn = computeWheelZoomFactor(-120);
    const zoomOut = computeWheelZoomFactor(120);
    expect(zoomOut).toBeCloseTo(1 / zoomIn, 6);
  });

  it("defaults to WHEEL_ZOOM_SENSITIVITY when no sensitivity override is passed", () => {
    expect(computeWheelZoomFactor(-100)).toBeCloseTo(Math.exp(100 * WHEEL_ZOOM_SENSITIVITY), 10);
  });

  it("is monotonically more extreme for a larger-magnitude delta", () => {
    expect(computeWheelZoomFactor(-240)).toBeGreaterThan(computeWheelZoomFactor(-120));
    expect(computeWheelZoomFactor(240)).toBeLessThan(computeWheelZoomFactor(120));
  });
});

describe("shouldIgnoreWheelGlide — 트랙패드 글라이드 가드", () => {
  it("미세 델타(|d|<4)는 무시한다", () => {
    expect(shouldIgnoreWheelGlide(1, false)).toBe(true);
    expect(shouldIgnoreWheelGlide(-3.9, false)).toBe(true);
  });
  it("의도적 델타(|d|>=4)는 통과한다", () => {
    expect(shouldIgnoreWheelGlide(4, false)).toBe(false);
    expect(shouldIgnoreWheelGlide(-120, false)).toBe(false);
  });
  it("핀치(ctrlKey)는 델타 크기와 무관하게 항상 통과한다", () => {
    expect(shouldIgnoreWheelGlide(0.5, true)).toBe(false);
    expect(shouldIgnoreWheelGlide(-1, true)).toBe(false);
  });
});
