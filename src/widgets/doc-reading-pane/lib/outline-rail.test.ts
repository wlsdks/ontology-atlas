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
  /*
   * Until 2026-09-11 the floors were the two widths the retired media queries encoded (1440
   * and 1536 of viewport, minus 344px of chrome) — 1096 and 1192 — because the rail was
   * pinned to the pane's right edge and had to *clear* a centred 760px column's glyphs. The
   * rail now starts one gutter past the column, so clearance is constructed and the floors
   * only ask whether it fits. They are derived, and the derivation is asserted below rather
   * than the number, so changing the measure moves them without anyone editing this file.
   */
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
   * The floors are the derivation, not two remembered numbers: the pane reserves the rail's
   * lane on the rail's own side (one gap plus the rail), the column centres in what is left,
   * and the leftover splits into two equal gutters.
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

  /*
   * ⚠️ **The lane is paid for once.** The 2026-09-11 form asked the pane to be wide enough for
   * the rail *and* for its mirror image on the other side of a fully centred column, which is
   * why a wider reading measure would have deleted the rail from a 1512 window with no dock
   * (1174 / 1238 against a 1168px pane). Reserving the lane on the side the rail is actually on
   * keeps that pane in the `wide` tier at the new measure, and the number is pinned here so the
   * next change to the measure cannot move it silently.
   */
  it("keeps the undocked 1512 pane in the wide tier at the 2026-09-12 measure", () => {
    expect(resolveOutlineRailFit(1168)).toBe("wide");
    // The form this replaced, for the record: it would have hidden the rail on that pane.
    expect(DOC_COLUMN_PX + 2 * (40 + OUTLINE_RAIL_WIDE_WIDTH + 24)).toBeGreaterThan(1168);
  });

  /*
   * The lane class and the `left` offset are literals because Tailwind only emits a utility for
   * a class name written out in source. They are the same arithmetic as the constants above, so
   * they are asserted against them rather than trusted.
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

  /*
   * The whole point of the move. A dock that takes 420px out of a 1512px window leaves a
   * 748px pane, which the window-based gate called wide enough and this one does not.
   */
  it("says hidden for the pane a docked conversation leaves behind at 1512", () => {
    expect(resolveOutlineRailFit(748)).toBe("hidden");
  });
});
