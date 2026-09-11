import { describe, expect, it } from "vitest";
import { DOC_COLUMN_GUTTER_PX, DOC_COLUMN_PX } from "@/shared/ui/reading-measure";
import {
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
   * The floors are the derivation, not two remembered numbers: with the column centred, the
   * room on the rail's side is `(W - column) / 2`, and the rail needs a gutter in front of it,
   * its own width, and the trailing reserve behind it.
   */
  it("derives both floors from the reading measure and the rail's own width", () => {
    expect(OUTLINE_RAIL_NARROW_PANE_MIN).toBe(outlineRailPaneFloor(OUTLINE_RAIL_NARROW_WIDTH));
    expect(OUTLINE_RAIL_WIDE_PANE_MIN).toBe(outlineRailPaneFloor(OUTLINE_RAIL_WIDE_WIDTH));
    for (const railWidth of [OUTLINE_RAIL_NARROW_WIDTH, OUTLINE_RAIL_WIDE_WIDTH]) {
      const floor = outlineRailPaneFloor(railWidth);
      // At the floor the rail fits; one pixel under it does not.
      expect((floor - DOC_COLUMN_PX) / 2).toBeGreaterThanOrEqual(DOC_COLUMN_GUTTER_PX + railWidth);
      expect((floor - 1 - DOC_COLUMN_PX) / 2).toBeLessThan(
        DOC_COLUMN_GUTTER_PX + railWidth + 24,
      );
    }
  });

  /*
   * ⚠️ **Recorded, not tuned.** Deriving the floors moved them down — a rail that starts one
   * gutter past the column needs less room than one that had to clear a 680px content run
   * centred in the pane. So the tier a given pane lands in changed, and the pane a 1512 window
   * with no dock leaves (1168) crossed from `narrow` to `wide`: the rail there is 200px rather
   * than 168. That is the consequence of the new arithmetic and it is pinned here so the next
   * change to the measure cannot move it silently.
   */
  it("puts the undocked 1512 pane in the wide tier, where the old floors put it in narrow", () => {
    expect(resolveOutlineRailFit(1168)).toBe("wide");
    // The retired floors, for the record: 1168 was narrow under 1096/1192.
    expect(1168 >= 1096 && 1168 < 1192).toBe(true);
  });

  /*
   * The whole point of the move. A dock that takes 420px out of a 1512px window leaves a
   * 748px pane, which the window-based gate called wide enough and this one does not.
   */
  it("says hidden for the pane a docked conversation leaves behind at 1512", () => {
    expect(resolveOutlineRailFit(748)).toBe("hidden");
  });
});
