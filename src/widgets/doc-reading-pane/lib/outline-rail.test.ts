import { describe, expect, it } from "vitest";
import {
  OUTLINE_RAIL_MIN_HEADINGS,
  OUTLINE_RAIL_NARROW_PANE_MIN,
  OUTLINE_RAIL_WIDE_PANE_MIN,
  resolveOutlineRailFit,
  shouldShowOutlineRail,
} from "./outline-rail";

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

describe("resolveOutlineRailFit", () => {
  /*
   * The floors are the same two widths the retired media queries encoded (1440 and 1536
   * of viewport, minus 344px of chrome). Pinning them here is what makes the change a
   * change of *what is measured* rather than of how much room the rail asks for —
   * measured on the rendered pane at 2026-09-06: 1512 → 1168 → narrow, 1440 → 1096 →
   * narrow, 1439 → 1095 → hidden.
   */
  it("hides the rail below the width where it would touch the body's glyphs", () => {
    expect(resolveOutlineRailFit(0)).toBe("hidden");
    expect(resolveOutlineRailFit(OUTLINE_RAIL_NARROW_PANE_MIN - 1)).toBe("hidden");
  });

  it("draws the 168px rail from the narrow floor and the 200px rail from the wide one", () => {
    expect(resolveOutlineRailFit(OUTLINE_RAIL_NARROW_PANE_MIN)).toBe("narrow");
    expect(resolveOutlineRailFit(OUTLINE_RAIL_WIDE_PANE_MIN - 1)).toBe("narrow");
    expect(resolveOutlineRailFit(OUTLINE_RAIL_WIDE_PANE_MIN)).toBe("wide");
    expect(resolveOutlineRailFit(4000)).toBe("wide");
  });

  /*
   * The whole point of the move. A dock that takes 420px out of a 1512px window leaves a
   * 748px pane, which the window-based gate called wide enough and this one does not.
   */
  it("says hidden for the pane a docked conversation leaves behind at 1512", () => {
    expect(resolveOutlineRailFit(748)).toBe("hidden");
  });
});
