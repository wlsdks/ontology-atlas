import { describe, expect, it } from "vitest";

import { computeStarDustCount } from "./starfield";

const AREA_PER_POINT = 5200; // --topology-v2-dust-area-per-point

describe("computeStarDustCount", () => {
  it("matches viewportWidth*viewportHeight/areaPerPoint, rounded, for a 1512x917 (14-inch) viewport", () => {
    // 1512 * 917 = 1,386,504; /5200 = 266.635... -> round to 267
    expect(computeStarDustCount(1512, 917, AREA_PER_POINT)).toBe(267);
  });

  it("matches for a 1920x1080 viewport", () => {
    // 1920*1080 = 2,073,600; /5200 = 398.769... -> round to 399
    expect(computeStarDustCount(1920, 1080, AREA_PER_POINT)).toBe(399);
  });

  it("scales up for larger viewports (2560x1440)", () => {
    const small = computeStarDustCount(1512, 917, AREA_PER_POINT);
    const large = computeStarDustCount(2560, 1440, AREA_PER_POINT);
    expect(large).toBeGreaterThan(small);
  });

  it("returns 0 for a degenerate zero-area viewport", () => {
    expect(computeStarDustCount(0, 900, AREA_PER_POINT)).toBe(0);
  });
});
