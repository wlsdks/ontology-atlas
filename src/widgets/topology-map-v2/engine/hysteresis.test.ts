import { describe, expect, it } from "vitest";

import { exceedsHysteresisThreshold, type Point } from "./hysteresis";

/**
 * Spec for `exceedsHysteresisThreshold` — the click-vs-drag threshold from
 * the prototype's pointermove handler. Currently throws (unimplemented) so
 * every test below is RED until the lead implements it against this file.
 *
 * `--topology-v2-hysteresis-px` = 7 (prototype value; design doc explicitly
 * prefers this over INTERACTION-DESIGN's "~10px" general recommendation).
 */
const THRESHOLD_PX = 7;
const DOWN: Point = { x: 100, y: 100 };

describe("exceedsHysteresisThreshold", () => {
  it("is false when the pointer has not moved at all", () => {
    expect(exceedsHysteresisThreshold(DOWN, { x: 100, y: 100 }, THRESHOLD_PX)).toBe(false);
  });

  it("is false for movement strictly inside the 7px threshold", () => {
    // distance = 5 (3-4-5 triangle)
    expect(exceedsHysteresisThreshold(DOWN, { x: 103, y: 104 }, THRESHOLD_PX)).toBe(false);
  });

  it("is false exactly at the 7px boundary (strictly-greater-than semantics, per prototype `> HYSTERESIS`)", () => {
    expect(exceedsHysteresisThreshold(DOWN, { x: 107, y: 100 }, THRESHOLD_PX)).toBe(false);
  });

  it("is true just past the 7px boundary", () => {
    expect(exceedsHysteresisThreshold(DOWN, { x: 107.01, y: 100 }, THRESHOLD_PX)).toBe(true);
  });

  it("is true for a diagonal movement whose Euclidean distance exceeds the threshold", () => {
    // distance = sqrt(6^2 + 6^2) ≈ 8.485 > 7
    expect(exceedsHysteresisThreshold(DOWN, { x: 106, y: 106 }, THRESHOLD_PX)).toBe(true);
  });

  it("is direction-agnostic (movement in any direction from downPoint counts)", () => {
    expect(exceedsHysteresisThreshold(DOWN, { x: 100, y: 92 }, THRESHOLD_PX)).toBe(true);
    expect(exceedsHysteresisThreshold(DOWN, { x: 92, y: 100 }, THRESHOLD_PX)).toBe(true);
  });
});
