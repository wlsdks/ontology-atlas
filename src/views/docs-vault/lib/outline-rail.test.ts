import { describe, expect, it } from "vitest";
import { OUTLINE_RAIL_MIN_HEADINGS, shouldShowOutlineRail } from "./outline-rail";

describe("shouldShowOutlineRail", () => {
  it("hides the rail below the minimum heading threshold", () => {
    expect(shouldShowOutlineRail(0)).toBe(false);
    expect(shouldShowOutlineRail(OUTLINE_RAIL_MIN_HEADINGS - 1)).toBe(false);
  });

  it("shows the rail at and above the minimum heading threshold", () => {
    expect(shouldShowOutlineRail(OUTLINE_RAIL_MIN_HEADINGS)).toBe(true);
    expect(shouldShowOutlineRail(OUTLINE_RAIL_MIN_HEADINGS + 5)).toBe(true);
  });
});
