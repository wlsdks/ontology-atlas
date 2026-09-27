import { describe, expect, it } from "vitest";
import { DOC_COLUMN_PX } from "@/shared/ui/reading-measure";
import {
  OUTLINE_RAIL_COLUMN_GAP,
  OUTLINE_RAIL_LANE_CLASS,
  OUTLINE_RAIL_LEFT_CLASS,
  OUTLINE_RAIL_MIN_HEADINGS,
  OUTLINE_RAIL_NARROW_PANE_MIN,
  OUTLINE_RAIL_NARROW_WIDTH,
  OUTLINE_RAIL_WIDE_PANE_MIN,
  OUTLINE_RAIL_WIDE_WIDTH,
  outlineRailPaneFloor,
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
  it("hides the rail below the width where it would not fit beside the column", () => {
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
   * The floors are derived: the pane reserves the rail's lane on its side and the column centres in
   * the rest.
   */
  it("derives both floors from the reading measure, the gap and the rail's own width", () => {
    expect(OUTLINE_RAIL_NARROW_PANE_MIN).toBe(outlineRailPaneFloor(OUTLINE_RAIL_NARROW_WIDTH));
    expect(OUTLINE_RAIL_WIDE_PANE_MIN).toBe(outlineRailPaneFloor(OUTLINE_RAIL_WIDE_WIDTH));
    for (const railWidth of [OUTLINE_RAIL_NARROW_WIDTH, OUTLINE_RAIL_WIDE_WIDTH]) {
      const floor = outlineRailPaneFloor(railWidth);
      const gutter = (floor - DOC_COLUMN_PX - OUTLINE_RAIL_COLUMN_GAP - railWidth) / 2;
      // At the floor both gutters clear the minimum; one pixel under it, they do not.
      expect(gutter).toBeGreaterThanOrEqual(48);
      expect(gutter - 0.5).toBeLessThan(48);
    }
  });

  /* The lane is reserved once; this pins that a 1168px pane stays `wide` at the current measure. */
  it("keeps the undocked 1512 pane in the wide tier at the 2026-09-12 measure", () => {
    expect(resolveOutlineRailFit(1168)).toBe("wide");
    // The form this replaced, for the record: it would have hidden the rail on that pane.
    expect(DOC_COLUMN_PX + 2 * (40 + OUTLINE_RAIL_WIDE_WIDTH + 24)).toBeGreaterThan(1168);
  });

  /*
   * The class literals are asserted against the constants because Tailwind needs literal class
   * names.
   */
  it("writes the lane and the left offset from the same gap and rail widths", () => {
    expect(OUTLINE_RAIL_LANE_CLASS.narrow).toBe(
      `pr-[${OUTLINE_RAIL_COLUMN_GAP + OUTLINE_RAIL_NARROW_WIDTH}px]`,
    );
    expect(OUTLINE_RAIL_LANE_CLASS.wide).toBe(
      `pr-[${OUTLINE_RAIL_COLUMN_GAP + OUTLINE_RAIL_WIDE_WIDTH}px]`,
    );
    for (const [fit, railWidth] of [
      ["narrow", OUTLINE_RAIL_NARROW_WIDTH],
      ["wide", OUTLINE_RAIL_WIDE_WIDTH],
    ] as const) {
      const lane = OUTLINE_RAIL_COLUMN_GAP + railWidth;
      expect(OUTLINE_RAIL_LEFT_CLASS[fit]).toBe(
        `left-[calc(50%_+_var(--measure-doc-column)_/_2_-_${lane / 2 - OUTLINE_RAIL_COLUMN_GAP}px)]`,
      );
    }
  });

  /* A 420px dock in a 1512px window leaves a 748px pane, which must not count as wide. */
  it("says hidden for the pane a docked conversation leaves behind at 1512", () => {
    expect(resolveOutlineRailFit(748)).toBe("hidden");
  });
});
